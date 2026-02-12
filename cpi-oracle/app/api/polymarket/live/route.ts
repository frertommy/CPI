import { NextResponse } from 'next/server';
import { getRecentOracle, getLastNOracle, storeTick, storeOracleValue, getOracleCount } from '@/lib/db';
import { fetchAllPrices } from '@/lib/polymarket';
import { computeOracle, getCpiBaseline } from '@/lib/oracle';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Is there a tick within the last 50 seconds?
    const recent = await getRecentOracle(50);

    if (recent.length > 0) {
      // Fresh tick exists — return it + last 10
      const last10 = await getLastNOracle(10);
      const count = await getOracleCount();
      return NextResponse.json({
        current: recent[0],
        feed: last10,
        tickCount: count,
      });
    }

    // 2. No fresh tick — fetch from Polymarket, store, compute, return
    const probs = await fetchAllPrices();
    const tick = await storeTick(probs);

    const { yoy, index } = getCpiBaseline();
    const oracle = computeOracle(probs, yoy, index);
    await storeOracleValue(tick.id, oracle);

    const last10 = await getLastNOracle(10);
    const count = await getOracleCount();

    return NextResponse.json({
      current: {
        ...oracle,
        computed_at: new Date().toISOString(),
        tick_id: tick.id,
      },
      feed: last10,
      tickCount: count,
    });
  } catch (error) {
    console.error('Live endpoint error:', error);
    // Try to return last known data on error
    try {
      const last10 = await getLastNOracle(10);
      const count = await getOracleCount();
      if (last10.length > 0) {
        return NextResponse.json({
          current: last10[0],
          feed: last10,
          tickCount: count,
          stale: true,
          error: String(error),
        });
      }
    } catch {
      // DB also failed
    }
    return NextResponse.json(
      { error: String(error), current: null, feed: [], tickCount: 0 },
      { status: 500 }
    );
  }
}
