import { NextResponse } from 'next/server';
import { getLatestCpi, getCpiStaleness, upsertCpiPrint } from '@/lib/db';
import { fetchCpiFromBLS } from '@/lib/bls';
import { setCpiBaseline } from '@/lib/oracle';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const staleness = await getCpiStaleness();

    // Refresh if stale (>24h) or no data
    if (staleness > 24) {
      try {
        const cpiData = await fetchCpiFromBLS();

        // Upsert all data points
        for (const d of cpiData.all_data) {
          // For each point, compute YoY if possible
          const lastYear = cpiData.all_data.find(
            (x) => x.year === d.year - 1 && x.period === d.period
          );
          const yoy = lastYear
            ? Math.round(((d.index_value - lastYear.index_value) / lastYear.index_value) * 100 * 10000) / 10000
            : null;

          // Compute MoM
          const periodNum = parseInt(d.period.replace('M', ''), 10);
          let prevMonth: typeof cpiData.all_data[0] | undefined;
          if (periodNum > 1) {
            const prevPeriod = `M${String(periodNum - 1).padStart(2, '0')}`;
            prevMonth = cpiData.all_data.find((x) => x.year === d.year && x.period === prevPeriod);
          } else {
            prevMonth = cpiData.all_data.find((x) => x.year === d.year - 1 && x.period === 'M12');
          }
          const mom = prevMonth
            ? Math.round(((d.index_value - prevMonth.index_value) / prevMonth.index_value) * 100 * 10000) / 10000
            : null;

          await upsertCpiPrint({
            series_id: cpiData.series_id,
            year: d.year,
            period: d.period,
            period_name: d.period_name,
            index_value: d.index_value,
            yoy_pct: yoy,
            mom_pct: mom,
          });
        }

        // Update in-memory baseline
        if (cpiData.yoy_pct !== null) {
          setCpiBaseline(cpiData.yoy_pct, cpiData.index_value);
        }
      } catch (blsError) {
        console.error('BLS API fetch error:', blsError);
        // Fall through — use whatever is in DB
      }
    }

    const latest = await getLatestCpi();
    if (!latest) {
      // Return hardcoded fallback if no data at all
      return NextResponse.json({
        latest: null,
        yoy_pct: 2.7,
        index_value: 324.054,
        print_date: 'Dec 2025 (fallback)',
      });
    }

    const yoy = latest.yoy_pct ? parseFloat(latest.yoy_pct) : 2.7;
    const idx = parseFloat(latest.index_value);

    // Update in-memory baseline
    setCpiBaseline(yoy, idx);

    return NextResponse.json({
      latest,
      yoy_pct: yoy,
      index_value: idx,
      print_date: `${latest.period_name} ${latest.year}`,
    });
  } catch (error) {
    console.error('CPI route error:', error);
    return NextResponse.json(
      { latest: null, yoy_pct: 2.7, index_value: 324.054, print_date: 'fallback' },
      { status: 200 }
    );
  }
}
