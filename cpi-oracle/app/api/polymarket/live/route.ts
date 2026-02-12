import { NextResponse } from 'next/server';
import {
  getRecentOracle, getLastNOracle, storeTick, storeOracleValue, getOracleCount,
  storeKalshiTick, storeOracleV2, getRecentOracleV2, getLastNOracleV2,
  getFredStaleness, upsertFredObservations, getLatestFredBySeriesId,
} from '@/lib/db';
import { fetchAllPrices } from '@/lib/polymarket';
import { computeOracle, getCpiBaseline, computeOracleV2, computePolymarketImpliedInflation } from '@/lib/oracle';
import { fetchKalshiCpiMarkets } from '@/lib/kalshi';
import { fetchAllFredSeries } from '@/lib/fred';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Check for a fresh V2 tick within the last 50 seconds
    const recentV2 = await getRecentOracleV2(50);
    const recent = await getRecentOracle(50);

    if (recentV2.length > 0 && recent.length > 0) {
      const last10 = await getLastNOracle(10);
      const last10v2 = await getLastNOracleV2(10);
      const count = await getOracleCount();
      const row = recentV2[0];

      return NextResponse.json({
        current: recent[0],
        current_v2: {
          oracle_v2: parseFloat(row.oracle_v2),
          oracle_v1: parseFloat(row.oracle_v1),
          cpi_yoy: parseFloat(row.cpi_yoy),
          kalshi_implied_cpi: row.kalshi_implied_cpi ? parseFloat(row.kalshi_implied_cpi) : null,
          tips_breakeven: row.tips_breakeven ? parseFloat(row.tips_breakeven) : null,
          polymarket_impl_infl: parseFloat(row.polymarket_impl_infl),
          weights: {
            cpi: parseFloat(row.w_cpi),
            kalshi: parseFloat(row.w_kalshi),
            tips: parseFloat(row.w_tips),
            polymarket: parseFloat(row.w_polymarket),
          },
          sources_active: buildSourcesActive(row),
        },
        feed: last10,
        feed_v2: last10v2,
        tickCount: count,
      });
    }

    // 2. No fresh tick — fetch from all sources, store, compute, return
    const probs = await fetchAllPrices();
    const tick = await storeTick(probs);

    const { yoy, index } = getCpiBaseline();
    const oracle = computeOracle(probs, yoy, index);
    await storeOracleValue(tick.id, oracle);

    // Kalshi
    let kalshiImpliedCpi: number | null = null;
    let kalshiTickId: number | null = null;
    try {
      const kalshiResult = await fetchKalshiCpiMarkets();
      if (kalshiResult.num_brackets > 0) {
        const kalshiRow = await storeKalshiTick(kalshiResult);
        kalshiImpliedCpi = kalshiResult.implied_cpi_yoy;
        kalshiTickId = kalshiRow.id;
      }
    } catch (e) {
      console.error('Kalshi fetch failed (non-fatal):', e);
    }

    // FRED
    let tipsBreakeven: number | null = null;
    try {
      const fredStaleness = await getFredStaleness();
      if (fredStaleness > 6) {
        const fredObs = await fetchAllFredSeries();
        if (fredObs.length > 0) await upsertFredObservations(fredObs);
      }
      const tipsRow = await getLatestFredBySeriesId('T5YIE');
      if (tipsRow) tipsBreakeven = parseFloat(tipsRow.value);
    } catch (e) {
      console.error('FRED fetch failed (non-fatal):', e);
    }

    // V2 oracle
    const polymarketImplInfl = computePolymarketImpliedInflation(probs, yoy);
    const v2Result = computeOracleV2({
      cpiYoy: yoy,
      kalshiImpliedCpi,
      tipsBreakeven,
      polymarketImpliedInflation: polymarketImplInfl,
      polymarketTickId: tick.id,
      kalshiTickId,
      probs,
      oracleV1: oracle.oracle_value,
    });
    await storeOracleV2(v2Result);

    const last10 = await getLastNOracle(10);
    const last10v2 = await getLastNOracleV2(10);
    const count = await getOracleCount();

    return NextResponse.json({
      current: {
        ...oracle,
        computed_at: new Date().toISOString(),
        tick_id: tick.id,
      },
      current_v2: {
        oracle_v2: v2Result.oracle_v2,
        oracle_v1: v2Result.oracle_v1,
        cpi_yoy: v2Result.cpi_yoy,
        kalshi_implied_cpi: v2Result.kalshi_implied_cpi,
        tips_breakeven: v2Result.tips_breakeven,
        polymarket_impl_infl: v2Result.polymarket_impl_infl,
        weights: v2Result.weights,
        sources_active: v2Result.sources_active,
      },
      feed: last10,
      feed_v2: last10v2,
      tickCount: count,
    });
  } catch (error) {
    console.error('Live endpoint error:', error);
    try {
      const last10 = await getLastNOracle(10);
      const last10v2 = await getLastNOracleV2(10);
      const count = await getOracleCount();
      if (last10.length > 0) {
        return NextResponse.json({
          current: last10[0],
          current_v2: last10v2.length > 0 ? formatV2Row(last10v2[0]) : null,
          feed: last10,
          feed_v2: last10v2,
          tickCount: count,
          stale: true,
          error: String(error),
        });
      }
    } catch {
      // DB also failed
    }
    return NextResponse.json(
      { error: String(error), current: null, current_v2: null, feed: [], feed_v2: [], tickCount: 0 },
      { status: 500 }
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildSourcesActive(row: any): string[] {
  const sources = ['cpi', 'polymarket'];
  if (row.kalshi_implied_cpi && parseFloat(row.w_kalshi) > 0) sources.push('kalshi');
  if (row.tips_breakeven && parseFloat(row.w_tips) > 0) sources.push('tips');
  return sources;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatV2Row(row: any) {
  return {
    oracle_v2: parseFloat(row.oracle_v2),
    oracle_v1: parseFloat(row.oracle_v1),
    cpi_yoy: parseFloat(row.cpi_yoy),
    kalshi_implied_cpi: row.kalshi_implied_cpi ? parseFloat(row.kalshi_implied_cpi) : null,
    tips_breakeven: row.tips_breakeven ? parseFloat(row.tips_breakeven) : null,
    polymarket_impl_infl: parseFloat(row.polymarket_impl_infl),
    weights: {
      cpi: parseFloat(row.w_cpi),
      kalshi: parseFloat(row.w_kalshi),
      tips: parseFloat(row.w_tips),
      polymarket: parseFloat(row.w_polymarket),
    },
    sources_active: buildSourcesActive(row),
  };
}
