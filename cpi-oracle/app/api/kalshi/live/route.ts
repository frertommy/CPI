import { NextResponse } from 'next/server';
import { getLatestKalshiTick } from '@/lib/db';
import { fetchKalshiCpiMarkets } from '@/lib/kalshi';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Try fetching fresh data
    let result;
    try {
      result = await fetchKalshiCpiMarkets();
    } catch (e) {
      console.error('Kalshi live fetch failed, using cached:', e);
      // Fall back to latest cached tick
      const cached = await getLatestKalshiTick();
      if (cached) {
        return NextResponse.json({
          event_ticker: cached.event_ticker,
          implied_cpi_yoy: cached.implied_cpi_yoy ? parseFloat(cached.implied_cpi_yoy) : null,
          num_brackets: cached.num_brackets,
          total_volume: parseInt(cached.total_volume, 10),
          brackets: [],
          fetched_at: cached.fetched_at,
          cached: true,
        });
      }
      return NextResponse.json({ error: String(e), brackets: [] }, { status: 500 });
    }

    return NextResponse.json({
      event_ticker: result.event_ticker,
      implied_cpi_yoy: result.implied_cpi_yoy,
      num_brackets: result.num_brackets,
      total_volume: result.total_volume,
      brackets: result.brackets,
      cached: false,
    });
  } catch (error) {
    console.error('Kalshi live error:', error);
    return NextResponse.json({ error: String(error), brackets: [] }, { status: 500 });
  }
}
