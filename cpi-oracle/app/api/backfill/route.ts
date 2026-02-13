import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { fetchMarketMeta, fetchPriceHistory } from '@/lib/polymarket';
import { fetchAllFredSeriesRange } from '@/lib/fred';
import { computeOracleFromProbs, computeOracleV2, computePolymarketImpliedInflation } from '@/lib/oracle';
import { upsertFredObservations, bulkInsertHistory, getHistoryCount } from '@/lib/db';
import { HistoryPoint } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CPI_YOY = 2.7; // Dec 2025 print — covers this entire backfill period

export async function GET() {
  const log: string[] = [];

  try {
    // ── Step 0: Find where live data starts ──────────────────────────
    // Live V2 rows have non-null polymarket_tick_id (from cron)
    const liveStart = await sql`
      SELECT MIN(computed_at) as first_live
      FROM oracle_values_v2
      WHERE polymarket_tick_id IS NOT NULL`;
    const firstLiveTs = liveStart.rows[0]?.first_live
      ? new Date(liveStart.rows[0].first_live).toISOString()
      : null;
    log.push(`First live V2 timestamp: ${firstLiveTs || 'none'}`);

    // ── Step 1: Clean up old backfill V2 data ────────────────────────
    log.push('\n=== CLEANING OLD BACKFILL V2 DATA ===');
    const deleted = await sql`
      DELETE FROM oracle_values_v2
      WHERE polymarket_tick_id IS NULL AND kalshi_tick_id IS NULL
      RETURNING id`;
    log.push(`Deleted ${deleted.rows.length} old backfill V2 rows`);

    // ── Step 2: Polymarket backfill ──────────────────────────────────
    log.push('\n=== POLYMARKET BACKFILL ===');

    // Always clear and re-fetch polymarket_history for clean data
    await sql`DELETE FROM polymarket_history`;
    log.push('Cleared polymarket_history table');

    const markets = await fetchMarketMeta();
    log.push(`Fetched ${markets.length} markets from Gamma API`);

    const histories: Record<number, { t: number; p: number }[]> = {};
    await Promise.all(
      markets.map(async (m) => {
        const h = await fetchPriceHistory(m.yesTokenId);
        histories[m.bps] = h;
        log.push(`  ${m.bps}bps: ${h.length} points`);
      })
    );

    // Bucket timestamps to nearest hour
    const allTimestamps = new Set<number>();
    for (const bps of Object.keys(histories)) {
      for (const point of histories[Number(bps)]) {
        const hourBucket = Math.round(point.t / 3600) * 3600;
        allTimestamps.add(hourBucket);
      }
    }

    // Build lookup maps
    const lookups: Record<number, Map<number, number>> = {};
    for (const bps of Object.keys(histories)) {
      const map = new Map<number, number>();
      for (const point of histories[Number(bps)]) {
        const hourBucket = Math.round(point.t / 3600) * 3600;
        map.set(hourBucket, point.p);
      }
      lookups[Number(bps)] = map;
    }

    // Compute V1 oracle for each hourly timestamp
    const sortedTs = Array.from(allTimestamps).sort((a, b) => a - b);
    const polyPoints: HistoryPoint[] = [];

    let lastNoChange = 0.5;
    let lastCut25 = 0.2;
    let lastCut50 = 0.1;
    let lastHike25 = 0.1;

    for (const ts of sortedTs) {
      const nc = lookups[0]?.get(ts) ?? lastNoChange;
      const c25 = lookups[-25]?.get(ts) ?? lastCut25;
      const c50 = lookups[-50]?.get(ts) ?? lastCut50;
      const h25 = lookups[25]?.get(ts) ?? lastHike25;

      lastNoChange = nc;
      lastCut25 = c25;
      lastCut50 = c50;
      lastHike25 = h25;

      const oracleVal = computeOracleFromProbs(nc, c25, c50, h25, CPI_YOY);

      polyPoints.push({
        timestamp: new Date(ts * 1000).toISOString(),
        prob_no_change: Math.round(nc * 10000) / 10000,
        prob_cut_25: Math.round(c25 * 10000) / 10000,
        prob_cut_50: Math.round(c50 * 10000) / 10000,
        prob_hike_25: Math.round(h25 * 10000) / 10000,
        oracle_value: oracleVal,
        source: 'backfill',
      });
    }

    log.push(`Computed ${polyPoints.length} hourly Polymarket history points`);

    if (polyPoints.length > 0) {
      await bulkInsertHistory(polyPoints);
      log.push(`Inserted ${polyPoints.length} rows into polymarket_history`);
    }

    // ── Step 3: FRED backfill ────────────────────────────────────────
    log.push('\n=== FRED BACKFILL ===');

    const startDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0];
    log.push(`Fetching FRED observations since ${startDate}`);

    const fredObs = await fetchAllFredSeriesRange(startDate);
    log.push(`Fetched ${fredObs.length} FRED observations total`);

    if (fredObs.length > 0) {
      await upsertFredObservations(fredObs);
      log.push(`Upserted ${fredObs.length} FRED observations`);
    }

    // Build date -> TIPS breakeven lookup (staircase: each date gets its value)
    const tipsLookup = new Map<string, number>();
    for (const obs of fredObs) {
      if (obs.series_id === 'T5YIE') {
        tipsLookup.set(obs.obs_date, obs.value);
      }
    }
    const tipsDates = Array.from(tipsLookup.keys()).sort();
    log.push(`TIPS breakeven dates available: ${tipsDates.length}`);

    // ── Step 4: Compute V2 oracle for backfill timestamps only ───────
    log.push('\n=== V2 ORACLE BACKFILL ===');

    // Only backfill timestamps BEFORE the first live V2 row
    // This prevents backfill/live overlap which causes sawtooth
    const backfillCutoff = firstLiveTs || new Date().toISOString();
    log.push(`Backfill cutoff (first live V2): ${backfillCutoff}`);

    const pointsToBackfill = polyPoints.filter(
      (p) => p.timestamp < backfillCutoff
    );
    log.push(`Points to backfill (before live data): ${pointsToBackfill.length} of ${polyPoints.length}`);

    // TIPS staircase lookup: for a given timestamp, use the last known TIPS value
    // on or before that calendar date. This produces a clean staircase.
    function getTipsForTimestamp(timestamp: string): number | null {
      const dateStr = timestamp.split('T')[0];
      let best: string | null = null;
      for (const d of tipsDates) {
        if (d <= dateStr) best = d;
        else break;
      }
      return best ? tipsLookup.get(best)! : null;
    }

    let v2Inserted = 0;

    for (const point of pointsToBackfill) {
      const nc = point.prob_no_change ?? 0;
      const c25 = point.prob_cut_25 ?? 0;
      const c50 = point.prob_cut_50 ?? 0;
      const h25 = point.prob_hike_25 ?? 0;

      const probs = {
        prob_no_change: nc,
        prob_cut_25: c25,
        prob_cut_50: c50,
        prob_hike_25: h25,
        raw_prices: {},
        event_slug: 'backfill',
      };

      const polyInflation = computePolymarketImpliedInflation(probs, CPI_YOY);
      const oracleV1 = point.oracle_value ?? computeOracleFromProbs(nc, c25, c50, h25, CPI_YOY);
      const tipsBreakeven = getTipsForTimestamp(point.timestamp);

      const v2Result = computeOracleV2({
        cpiYoy: CPI_YOY,
        kalshiImpliedCpi: null,
        tipsBreakeven,
        polymarketImpliedInflation: polyInflation,
        polymarketTickId: null,
        kalshiTickId: null,
        probs,
        oracleV1,
      });

      await sql`
        INSERT INTO oracle_values_v2 (
          computed_at,
          oracle_v2, oracle_v1,
          w_cpi, w_kalshi, w_tips, w_polymarket,
          cpi_yoy, kalshi_implied_cpi, tips_breakeven, polymarket_impl_infl,
          polymarket_tick_id, kalshi_tick_id,
          prob_no_change, prob_cut_25, prob_cut_50, prob_hike_25
        ) VALUES (
          ${point.timestamp}::timestamptz,
          ${v2Result.oracle_v2}, ${v2Result.oracle_v1},
          ${v2Result.weights.cpi}, ${v2Result.weights.kalshi}, ${v2Result.weights.tips}, ${v2Result.weights.polymarket},
          ${v2Result.cpi_yoy}, ${v2Result.kalshi_implied_cpi}, ${v2Result.tips_breakeven}, ${v2Result.polymarket_impl_infl},
          ${v2Result.polymarket_tick_id}, ${v2Result.kalshi_tick_id},
          ${v2Result.prob_no_change}, ${v2Result.prob_cut_25}, ${v2Result.prob_cut_50}, ${v2Result.prob_hike_25}
        )`;
      v2Inserted++;
    }

    log.push(`V2 oracle backfill: inserted ${v2Inserted}`);

    // Sample first, middle, last
    if (v2Inserted > 0) {
      const sample = await sql`
        SELECT computed_at, oracle_v2, tips_breakeven, w_cpi, w_tips
        FROM oracle_values_v2
        WHERE polymarket_tick_id IS NULL
        ORDER BY computed_at ASC
        LIMIT 3`;
      for (const r of sample.rows) {
        log.push(`  ${String(r.computed_at).slice(0, 19)}: v2=${r.oracle_v2} tips=${r.tips_breakeven}`);
      }
    }

    // ── Final summary ────────────────────────────────────────────────
    log.push('\n=== SUMMARY ===');

    const finalPolyCount = await getHistoryCount();
    const finalV2Count = await sql`SELECT COUNT(*) as count FROM oracle_values_v2`;
    const finalFredCount = await sql`SELECT COUNT(*) as count FROM fred_observations`;
    const backfillV2 = await sql`SELECT COUNT(*) as count FROM oracle_values_v2 WHERE polymarket_tick_id IS NULL`;
    const liveV2 = await sql`SELECT COUNT(*) as count FROM oracle_values_v2 WHERE polymarket_tick_id IS NOT NULL`;

    log.push(`polymarket_history: ${finalPolyCount} rows`);
    log.push(`oracle_values_v2 total: ${parseInt(finalV2Count.rows[0].count, 10)}`);
    log.push(`  backfill: ${parseInt(backfillV2.rows[0].count, 10)}`);
    log.push(`  live: ${parseInt(liveV2.rows[0].count, 10)}`);
    log.push(`fred_observations: ${parseInt(finalFredCount.rows[0].count, 10)}`);

    return NextResponse.json({
      status: 'ok',
      polymarket_history: finalPolyCount,
      oracle_v2_total: parseInt(finalV2Count.rows[0].count, 10),
      fred_observations: parseInt(finalFredCount.rows[0].count, 10),
      log,
    });
  } catch (error) {
    log.push(`\nERROR: ${String(error)}`);
    console.error('Backfill error:', error);
    return NextResponse.json(
      { status: 'error', error: String(error), log },
      { status: 500 }
    );
  }
}
