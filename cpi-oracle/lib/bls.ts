const BLS_API = 'https://api.bls.gov/publicAPI/v2/timeseries/data/';
const SERIES_ID = 'CUSR0000SA0';

interface BlsDataPoint {
  year: string;
  period: string;
  periodName: string;
  value: string;
  latest?: string;
}

interface BlsResponse {
  status: string;
  Results: {
    series: Array<{
      seriesID: string;
      data: BlsDataPoint[];
    }>;
  };
}

export interface CpiData {
  series_id: string;
  year: number;
  period: string;
  period_name: string;
  index_value: number;
  yoy_pct: number | null;
  mom_pct: number | null;
  all_data: Array<{
    year: number;
    period: string;
    period_name: string;
    index_value: number;
  }>;
}

export async function fetchCpiFromBLS(): Promise<CpiData> {
  const currentYear = new Date().getFullYear();
  const body = {
    seriesid: [SERIES_ID],
    startyear: String(currentYear - 2),
    endyear: String(currentYear),
    ...(process.env.BLS_API_KEY ? { registrationkey: process.env.BLS_API_KEY } : {}),
  };

  const res = await fetch(BLS_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`BLS API error: ${res.status} ${res.statusText}`);
  }

  const json: BlsResponse = await res.json();

  if (json.status !== 'REQUEST_SUCCEEDED') {
    throw new Error(`BLS API status: ${json.status}`);
  }

  const series = json.Results.series[0];
  if (!series || series.data.length === 0) {
    throw new Error('No CPI data returned from BLS');
  }

  // Data is sorted newest first
  const data = series.data
    .filter((d) => d.period.startsWith('M'))
    .map((d) => ({
      year: parseInt(d.year, 10),
      period: d.period,
      period_name: d.periodName,
      index_value: parseFloat(d.value),
    }));

  const latest = data[0];

  // Find same period last year for YoY
  const lastYearPeriod = data.find(
    (d) => d.year === latest.year - 1 && d.period === latest.period
  );

  let yoy_pct: number | null = null;
  if (lastYearPeriod) {
    yoy_pct =
      Math.round(
        ((latest.index_value - lastYearPeriod.index_value) / lastYearPeriod.index_value) * 100 * 10000
      ) / 10000;
  }

  // Find previous month for MoM
  const periodNum = parseInt(latest.period.replace('M', ''), 10);
  let prevMonth: typeof data[0] | undefined;
  if (periodNum > 1) {
    const prevPeriod = `M${String(periodNum - 1).padStart(2, '0')}`;
    prevMonth = data.find((d) => d.year === latest.year && d.period === prevPeriod);
  } else {
    prevMonth = data.find((d) => d.year === latest.year - 1 && d.period === 'M12');
  }

  let mom_pct: number | null = null;
  if (prevMonth) {
    mom_pct =
      Math.round(
        ((latest.index_value - prevMonth.index_value) / prevMonth.index_value) * 100 * 10000
      ) / 10000;
  }

  return {
    series_id: SERIES_ID,
    year: latest.year,
    period: latest.period,
    period_name: latest.period_name,
    index_value: latest.index_value,
    yoy_pct,
    mom_pct,
    all_data: data,
  };
}
