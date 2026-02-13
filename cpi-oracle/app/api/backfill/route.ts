import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { fetchMarketMeta, fetchPriceHistory } from '@/lib/polymarket';
import { fetchAllFredSeriesRange } from '@/lib/fred';
import { computeOracleFromProbs, computeOracleV2, computePolymarketImpliedInflation } from '@/lib/oracle';
import { upsertFredObservations, bulkInsertHistory, getHistoryCount } from '@/lib/db';
import { HistoryPoint, FredObservation } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CPI_YOY = 2.7; // Dec 2025 print — covers this entire backfill period

export async function GET() {
  const log: string[] = [];

  try {
    // ── Step 1: Polymarket backfill ──────────────────────────────────
    log.push('=== POLYMARKET BACKFILL ===');

    const existingCount = await getHistoryCount();
    log.push(`Existing polymarket_history rows: ${existingCount}`);

    let polyPoints: HistoryPoint[] = [];

    if (existingCount < 100) {
      // Need to backfill — use yesTokenId (NOT conditionId) for CLOB history
      const markets = await fetchMarketMeta();
      log.push(`Fetched ${markets.length} markets from Gamma API`);

      const histories: Record<number, { t: number; p: number }[]> = {};
      await Promise.all(
        markets.map(async (m) => {
          // CRITICAL: use yesTokenId, not conditionId
          const h = await fetchPriceHistory(m.yesTokenId);
          histories[m.bps] = h;
          log.push(`  ${m.bps}bps: ${h.length} points (token=${m.yesTokenId.slice(0, 20)}...)`);
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

      // Merge and compute V1 oracle for each hourly timestamp
      const sortedTs = Array.from(allTimestamps).sort((a, b) => a - b);

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
    } else {
      log.push(`polymarket_history already has ${existingCount} rows — skipping Polymarket backfill`);
      // Load existing polymarket history for V2 computation
      const rows = await sql`SELECT * FROM polymarket_history ORDER BY timestamp ASC`;
      polyPoints = rows.rows.map((r) => ({
        timestamp: r.timestamp,
        prob_no_change: parseFloat(r.prob_no_change),
        prob_cut_25: parseFloat(r.prob_cut_25),
        prob_cut_50: parseFloat(r.prob_cut_50),
        prob_hike_25: parseFloat(r.prob_hike_25),
        oracle_value: parseFloat(r.oracle_value),
        source: r.source,
      }));
    }

    // ── Step 2: FRED backfill ────────────────────────────────────────
    log.push('\n=== FRED BACKFILL ===');

    const startDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0]; // 45 days ago
    log.push(`Fetching FRED observations since ${startDate}`);

    const fredObs = await fetchAllFredSeriesRange(startDate);
    log.push(`Fetched ${fredObs.length} FRED observations total`);

    if (fredObs.length > 0) {
      await upsertFredObservations(fredObs);
      log.push(`Upserted ${fredObs.length} FRED observations`);

      // Log breakdown by series
      const bySeries: Record<string, number> = {};
      for (const obs of fredObs) {
        bySeries[obs.series_id] = (bySeries[obs.series_id] || 0) + 1;
      }
      for (const [s, c] of Object.entries(bySeries)) {
        log.push(`  ${s}: ${c} observations`);
      }
    }

    // Build a date -> TIPS breakeven lookup for V2 computation
    const tipsLookup = new Map<string, number>();
    for (const obs of fredObs) {
      if (obs.series_id === 'T5YIE') {
        tipsLookup.set(obs.obs_date, obs.value);
      }
    }
    log.push(`TIPS breakeven dates available: ${tipsLookup.size}`);

    // ── Step 3: Kalshi backfill ──────────────────────────────────────
    log.push('\n=== KALSHI BACKFILL ===');
    log.push('Kalshi public API does not expose historical price data — skipping.');
    log.push('Historical V2 oracle will use adaptive weights without Kalshi.');

    // ── Step 4: Compute historical V2 oracle values ──────────────────
    log.push('\n=== V2 ORACLE BACKFILL ===');

    // Check how many V2 backfill rows already exist
    const existingV2 = await sql`
      SELECT COUNT(*) as count FROM oracle_values_v2
      WHERE polymarket_tick_id IS NULL AND kalshi_tick_id IS NULL`;
    const existingV2Count = parseInt(existingV2.rows[0].count, 10);
    log.push(`Existing backfill V2 rows: ${existingV2Count}`);

    if (existingV2Count > 100) {
      log.push('V2 backfill already populated — skipping V2 computation');
    } else {
      // For each Polymarket history point, compute V2 oracle
      // Look up the nearest TIPS breakeven for that day
      let v2Inserted = 0;
      let v2Skipped = 0;

      // Sort TIPS dates for nearest-date lookup
      const tipsDates = Array.from(tipsLookup.keys()).sort();

      function getNearestTips(timestamp: string): number | null {
        // Get the date part
        const dateStr = timestamp.split('T')[0];

        // Find the latest TIPS observation on or before this date
        let best: string | null = null;
        for (const d of tipsDates) {
          if (d <= dateStr) best = d;
          else break;
        }
        return best ? tipsLookup.get(best)! : null;
      }

      // Process in batches to avoid timeout
      for (const point of polyPoints) {
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
        const tipsBreakeven = getNearestTips(point.timestamp);

        const v2Result = computeOracleV2({
          cpiYoy: CPI_YOY,
          kalshiImpliedCpi: null, // No historical Kalshi data
          tipsBreakeven,
          polymarketImpliedInflation: polyInflation,
          polymarketTickId: null,
          kalshiTickId: null,
          probs,
          oracleV1,
        });

        try {
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
        } catch (e) {
          // Might fail on duplicate timestamp - skip
          v2Skipped++;
        }
      }

      log.push(`V2 oracle: inserted ${v2Inserted}, skipped ${v2Skipped}`);

      // Sample some values
      if (v2Inserted > 0) {
        const sample = await sql`
          SELECT computed_at, oracle_v2, oracle_v1, tips_breakeven, w_cpi, w_tips
          FROM oracle_values_v2
          ORDER BY computed_at ASC
          LIMIT 3`;
        for (const r of sample.rows) {
          log.push(`  ${r.computed_at}: v2=${r.oracle_v2} v1=${r.oracle_v1} tips=${r.tips_breakeven} wCpi=${r.w_cpi} wTips=${r.w_tips}`);
        }
      }
    }

    // ── Final summary ────────────────────────────────────────────────
    log.push('\n=== SUMMARY ===');

    const finalPolyCount = await getHistoryCount();
    const finalV2Count = await sql`SELECT COUNT(*) as count FROM oracle_values_v2`;
    const finalFredCount = await sql`SELECT COUNT(*) as count FROM fred_observations`;

    log.push(`polymarket_history: ${finalPolyCount} rows`);
    log.push(`oracle_values_v2: ${parseInt(finalV2Count.rows[0].count, 10)} rows`);
    log.push(`fred_observations: ${parseInt(finalFredCount.rows[0].count, 10)} rows`);

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
