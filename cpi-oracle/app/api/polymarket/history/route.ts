import { NextResponse } from 'next/server';
import { getHistoryCount, bulkInsertHistory, getHistory, getLiveOracleAfter } from '@/lib/db';
import { fetchMarketMeta, fetchPriceHistory } from '@/lib/polymarket';
import { computeOracleFromProbs } from '@/lib/oracle';
import { HistoryPoint } from '@/lib/types';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const count = await getHistoryCount();

    if (count === 0) {
      // Backfill from Polymarket history
      try {
        const markets = await fetchMarketMeta();

        // Fetch history for each outcome
        const histories: Record<number, { t: number; p: number }[]> = {};
        await Promise.all(
          markets.map(async (m) => {
            const h = await fetchPriceHistory(m.yesTokenId);
            histories[m.bps] = h;
          })
        );

        // Collect all unique timestamps (bucket to nearest hour)
        const allTimestamps = new Set<number>();
        for (const bps of Object.keys(histories)) {
          for (const point of histories[Number(bps)]) {
            const hourBucket = Math.round(point.t / 3600) * 3600;
            allTimestamps.add(hourBucket);
          }
        }

        // Build lookup maps (timestamp -> price) for each outcome
        const lookups: Record<number, Map<number, number>> = {};
        for (const bps of Object.keys(histories)) {
          const map = new Map<number, number>();
          for (const point of histories[Number(bps)]) {
            const hourBucket = Math.round(point.t / 3600) * 3600;
            map.set(hourBucket, point.p);
          }
          lookups[Number(bps)] = map;
        }

        // Merge and compute oracle for each timestamp
        const sortedTs = Array.from(allTimestamps).sort((a, b) => a - b);
        const points: HistoryPoint[] = [];

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

          const oracleVal = computeOracleFromProbs(nc, c25, c50, h25);

          points.push({
            timestamp: new Date(ts * 1000).toISOString(),
            prob_no_change: Math.round(nc * 10000) / 10000,
            prob_cut_25: Math.round(c25 * 10000) / 10000,
            prob_cut_50: Math.round(c50 * 10000) / 10000,
            prob_hike_25: Math.round(h25 * 10000) / 10000,
            oracle_value: oracleVal,
            source: 'backfill',
          });
        }

        if (points.length > 0) {
          await bulkInsertHistory(points);
        }
      } catch (backfillError) {
        console.error('Backfill error:', backfillError);
      }
    }

    // Get all backfill history
    const history = await getHistory();

    // Always get live oracle values — either after backfill or from epoch
    const afterTs = history.length > 0
      ? history[history.length - 1].timestamp
      : '1970-01-01T00:00:00Z';

    const liveRows = await getLiveOracleAfter(afterTs);
    const livePoints: HistoryPoint[] = liveRows.map((r) => ({
      timestamp: r.timestamp,
      prob_no_change: r.prob_no_change ? parseFloat(r.prob_no_change) : null,
      prob_cut_25: r.prob_cut_25 ? parseFloat(r.prob_cut_25) : null,
      prob_cut_50: r.prob_cut_50 ? parseFloat(r.prob_cut_50) : null,
      prob_hike_25: r.prob_hike_25 ? parseFloat(r.prob_hike_25) : null,
      oracle_value: r.oracle_value ? parseFloat(r.oracle_value) : null,
      source: 'live',
    }));

    // Also get V2 oracle history for the chart
    const v2Rows = await sql`
      SELECT computed_at, oracle_v2, oracle_v1, kalshi_implied_cpi, tips_breakeven, polymarket_impl_infl
      FROM oracle_values_v2
      ORDER BY computed_at ASC`;

    const v2History = v2Rows.rows.map((r) => ({
      timestamp: r.computed_at,
      oracle_v2: parseFloat(r.oracle_v2),
      oracle_v1: parseFloat(r.oracle_v1),
      kalshi_implied_cpi: r.kalshi_implied_cpi ? parseFloat(r.kalshi_implied_cpi) : null,
      tips_breakeven: r.tips_breakeven ? parseFloat(r.tips_breakeven) : null,
      polymarket_impl_infl: parseFloat(r.polymarket_impl_infl),
    }));

    const merged = [
      ...history.map((h) => ({
        timestamp: h.timestamp,
        prob_no_change: h.prob_no_change ? parseFloat(h.prob_no_change) : null,
        prob_cut_25: h.prob_cut_25 ? parseFloat(h.prob_cut_25) : null,
        prob_cut_50: h.prob_cut_50 ? parseFloat(h.prob_cut_50) : null,
        prob_hike_25: h.prob_hike_25 ? parseFloat(h.prob_hike_25) : null,
        oracle_value: h.oracle_value ? parseFloat(h.oracle_value) : null,
        source: h.source || 'backfill',
      })),
      ...livePoints,
    ];

    return NextResponse.json({ history: merged, v2History });
  } catch (error) {
    console.error('History route error:', error);
    return NextResponse.json({ history: [], v2History: [], error: String(error) }, { status: 500 });
  }
}
