import { FredObservation, FredLatestResponse } from './types';

const FRED_API = 'https://api.stlouisfed.org/fred/series/observations';

// Primary TIPS breakeven series (daily updates)
const TIPS_PRIMARY = 'T5YIE';
// Companion series for display
const ALL_SERIES = ['T5YIE', 'T10YIE', 'T5YIFR', 'EXPINF1YR', 'EXPINF10YR'];

export async function fetchFredSeries(seriesId: string): Promise<FredObservation[]> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    console.warn('FRED_API_KEY not set — skipping FRED fetch for', seriesId);
    return [];
  }

  const url = `${FRED_API}?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=5`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`FRED API error for ${seriesId}: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const observations: FredObservation[] = [];

  for (const obs of data.observations || []) {
    // FRED returns "." for missing values
    if (obs.value === '.' || obs.value === undefined) continue;
    const value = parseFloat(obs.value);
    if (isNaN(value)) continue;

    observations.push({
      series_id: seriesId,
      obs_date: obs.date,
      value,
    });
  }

  return observations;
}

export async function fetchFredSeriesRange(seriesId: string, startDate: string): Promise<FredObservation[]> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return [];

  const url = `${FRED_API}?series_id=${seriesId}&api_key=${apiKey}&file_type=json&observation_start=${startDate}&sort_order=asc`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`FRED API error for ${seriesId}: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const observations: FredObservation[] = [];

  for (const obs of data.observations || []) {
    if (obs.value === '.' || obs.value === undefined) continue;
    const value = parseFloat(obs.value);
    if (isNaN(value)) continue;
    observations.push({ series_id: seriesId, obs_date: obs.date, value });
  }

  return observations;
}

export async function fetchAllFredSeriesRange(startDate: string): Promise<FredObservation[]> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return [];

  const results = await Promise.allSettled(
    ALL_SERIES.map((s) => fetchFredSeriesRange(s, startDate))
  );

  const allObs: FredObservation[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') allObs.push(...r.value);
  }
  return allObs;
}

export async function fetchAllFredSeries(): Promise<FredObservation[]> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    console.warn('FRED_API_KEY not set — skipping all FRED fetches');
    return [];
  }

  const results = await Promise.allSettled(
    ALL_SERIES.map((s) => fetchFredSeries(s))
  );

  const allObs: FredObservation[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') {
      allObs.push(...r.value);
    }
  }

  return allObs;
}

export function getLatestBySeriesFromList(observations: FredObservation[]): FredLatestResponse {
  const result: FredLatestResponse = {
    T5YIE: null,
    T10YIE: null,
    T5YIFR: null,
    EXPINF1YR: null,
    EXPINF10YR: null,
  };

  for (const obs of observations) {
    const key = obs.series_id as keyof FredLatestResponse;
    if (key in result && result[key] === null) {
      result[key] = obs;
    }
  }

  return result;
}

export function getTipsBreakeven(fredData: FredLatestResponse): number | null {
  // Prefer T5YIE (daily 5-year breakeven)
  if (fredData.T5YIE) return fredData.T5YIE.value;
  return null;
}

export { TIPS_PRIMARY, ALL_SERIES };
