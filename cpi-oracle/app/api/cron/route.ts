import { NextResponse } from 'next/server';
import { storeTick, storeOracleValue, storeKalshiTick, storeOracleV2, getFredStaleness, upsertFredObservations, getLatestFredBySeriesId } from '@/lib/db';
import { fetchAllPrices } from '@/lib/polymarket';
import { computeOracle, getCpiBaseline, computeOracleV2, computePolymarketImpliedInflation } from '@/lib/oracle';
import { fetchKalshiCpiMarkets } from '@/lib/kalshi';
import { fetchAllFredSeries } from '@/lib/fred';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 1. Fetch Polymarket prices → store in polymarket_ticks
    const probs = await fetchAllPrices();
    const tick = await storeTick(probs);

    // 2. Compute & store V1 oracle (unchanged)
    const { yoy, index } = getCpiBaseline();
    const oracle = computeOracle(probs, yoy, index);
    await storeOracleValue(tick.id, oracle);

    // 3. Fetch Kalshi CPI YoY markets → store in kalshi_ticks
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

    // 4. Check FRED cache: if older than 6 hours → fetch
    let tipsBreakeven: number | null = null;
    try {
      const fredStaleness = await getFredStaleness();
      if (fredStaleness > 6) {
        const fredObs = await fetchAllFredSeries();
        if (fredObs.length > 0) {
          await upsertFredObservations(fredObs);
        }
      }
      const tipsRow = await getLatestFredBySeriesId('T5YIE');
      if (tipsRow) tipsBreakeven = parseFloat(tipsRow.value);
    } catch (e) {
      console.error('FRED fetch failed (non-fatal):', e);
    }

    // 5. Compute & store V2 oracle
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

    return NextResponse.json({
      status: 'ok',
      oracle_v1: oracle.oracle_value,
      oracle_v2: v2Result.oracle_v2,
      sources_active: v2Result.sources_active,
      tick_id: tick.id,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Cron error:', error);
    return NextResponse.json(
      { status: 'error', message: String(error) },
      { status: 500 }
    );
  }
}
