import { NextResponse } from 'next/server';
import { getLatestFredAll, getFredStaleness, upsertFredObservations } from '@/lib/db';
import { fetchAllFredSeries } from '@/lib/fred';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Refresh if stale
    const staleness = await getFredStaleness();
    if (staleness > 6) {
      try {
        const fredObs = await fetchAllFredSeries();
        if (fredObs.length > 0) {
          await upsertFredObservations(fredObs);
        }
      } catch (e) {
        console.error('FRED refresh failed (non-fatal):', e);
      }
    }

    const latest = await getLatestFredAll();
    return NextResponse.json(latest);
  } catch (error) {
    console.error('FRED latest error:', error);
    return NextResponse.json(
      { error: String(error), T5YIE: null, T10YIE: null, T5YIFR: null, EXPINF1YR: null, EXPINF10YR: null },
      { status: 500 }
    );
  }
}
