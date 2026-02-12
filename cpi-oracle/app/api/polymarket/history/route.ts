import { NextResponse } from 'next/server';
import { getHistoryCount, bulkInsertHistory, getHistory, getLiveOracleAfter } from '@/lib/db';
import { fetchMarketMeta, fetchPriceHistory } from '@/lib/polymarket';
import { computeOracleFromProbs } from '@/lib/oracle';
import { HistoryPoint } from '@/lib/types';

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
            const h = await fetchPriceHistory(m.conditionId);
            histories[m.bps] = h;
          })
        );

        // Collect all unique timestamps (bucket to nearest hour)
        const allTimestamps = new Set<number>();
        for (const bps of Object.keys(histories)) {
          for (const point of histories[Number(bps)]) {
            // Round to nearest hour
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

        // Track last known values for interpolation
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

        // Bulk insert
        await bulkInsertHistory(points);
      } catch (backfillError) {
        console.error('Backfill error:', backfillError);
        // Continue — return whatever we have
      }
    }

    // Get all history
    const history = await getHistory();

    // Also get any live oracle values newer than the last history point
    let livePoints: HistoryPoint[] = [];
    if (history.length > 0) {
      const lastTs = history[history.length - 1].timestamp;
      const liveRows = await getLiveOracleAfter(lastTs);
      livePoints = liveRows.map((r) => ({
        timestamp: r.timestamp,
        prob_no_change: r.prob_no_change ? parseFloat(r.prob_no_change) : null,
        prob_cut_25: r.prob_cut_25 ? parseFloat(r.prob_cut_25) : null,
        prob_cut_50: r.prob_cut_50 ? parseFloat(r.prob_cut_50) : null,
        prob_hike_25: r.prob_hike_25 ? parseFloat(r.prob_hike_25) : null,
        oracle_value: r.oracle_value ? parseFloat(r.oracle_value) : null,
        source: 'live',
      }));
    }

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

    return NextResponse.json({ history: merged });
  } catch (error) {
    console.error('History route error:', error);
    return NextResponse.json({ history: [], error: String(error) }, { status: 500 });
  }
}
