import { NextResponse } from 'next/server';
import { storeTick, storeOracleValue } from '@/lib/db';
import { fetchAllPrices } from '@/lib/polymarket';
import { computeOracle, getCpiBaseline } from '@/lib/oracle';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // Verify cron secret in production
  const authHeader = request.headers.get('authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const probs = await fetchAllPrices();
    const tick = await storeTick(probs);

    const { yoy, index } = getCpiBaseline();
    const oracle = computeOracle(probs, yoy, index);
    await storeOracleValue(tick.id, oracle);

    return NextResponse.json({
      status: 'ok',
      oracle_value: oracle.oracle_value,
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
