import { neonConfig } from '@neondatabase/serverless';
import { sql } from '@vercel/postgres';
import { PolymarketProbs, OracleResult, OracleV2Result, HistoryPoint, FredObservation, KalshiResult, OracleV2Row } from './types';

// Configure proxy-aware fetch for environments behind an HTTP proxy (e.g. local dev containers)
const proxyUrl = process.env.HTTP_PROXY || process.env.http_proxy;
if (proxyUrl) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ProxyAgent } = require('undici');
    const agent = new ProxyAgent(proxyUrl);
    neonConfig.fetchFunction = (url: any, init: any) =>
      fetch(url, { ...init, dispatcher: agent } as any);
  } catch {
    // undici not available — proxy fetch not configured
  }
}

export async function createTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS polymarket_ticks (
      id              SERIAL PRIMARY KEY,
      fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      prob_no_change  DECIMAL(6,4) NOT NULL,
      prob_cut_25     DECIMAL(6,4) NOT NULL,
      prob_cut_50     DECIMAL(6,4) NOT NULL,
      prob_hike_25    DECIMAL(6,4) NOT NULL,
      raw_prices      JSONB,
      event_slug      TEXT NOT NULL DEFAULT 'fed-decision-in-march-885',
      market_status   TEXT DEFAULT 'active'
    )`;

  await sql`CREATE INDEX IF NOT EXISTS idx_ticks_fetched_at ON polymarket_ticks (fetched_at DESC)`;

  await sql`
    CREATE TABLE IF NOT EXISTS oracle_values (
      id                  SERIAL PRIMARY KEY,
      computed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      tick_id             INTEGER REFERENCES polymarket_ticks(id),
      oracle_value        DECIMAL(8,4) NOT NULL,
      implied_rate_change DECIMAL(8,4) NOT NULL,
      implied_inflation   DECIMAL(8,4) NOT NULL,
      alpha               DECIMAL(4,2) NOT NULL DEFAULT 0.80,
      cpi_yoy_used        DECIMAL(6,4) NOT NULL,
      cpi_index_used      DECIMAL(10,3),
      prob_no_change      DECIMAL(6,4) NOT NULL,
      prob_cut_25         DECIMAL(6,4) NOT NULL,
      prob_cut_50         DECIMAL(6,4) NOT NULL,
      prob_hike_25        DECIMAL(6,4) NOT NULL
    )`;

  await sql`CREATE INDEX IF NOT EXISTS idx_oracle_computed_at ON oracle_values (computed_at DESC)`;

  await sql`
    CREATE TABLE IF NOT EXISTS cpi_prints (
      id              SERIAL PRIMARY KEY,
      fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      series_id       TEXT NOT NULL DEFAULT 'CUSR0000SA0',
      year            INTEGER NOT NULL,
      period          TEXT NOT NULL,
      period_name     TEXT NOT NULL,
      index_value     DECIMAL(10,3) NOT NULL,
      yoy_pct         DECIMAL(6,4),
      mom_pct         DECIMAL(6,4),
      UNIQUE(series_id, year, period)
    )`;

  await sql`
    CREATE TABLE IF NOT EXISTS polymarket_history (
      id              SERIAL PRIMARY KEY,
      timestamp       TIMESTAMPTZ NOT NULL,
      prob_no_change  DECIMAL(6,4),
      prob_cut_25     DECIMAL(6,4),
      prob_cut_50     DECIMAL(6,4),
      prob_hike_25    DECIMAL(6,4),
      oracle_value    DECIMAL(8,4),
      source          TEXT NOT NULL DEFAULT 'backfill',
      UNIQUE(timestamp)
    )`;

  await sql`CREATE INDEX IF NOT EXISTS idx_history_ts ON polymarket_history (timestamp DESC)`;

  // --- V2 Tables ---

  await sql`
    CREATE TABLE IF NOT EXISTS kalshi_ticks (
      id              SERIAL PRIMARY KEY,
      fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      event_ticker    TEXT NOT NULL,
      markets_json    JSONB NOT NULL,
      implied_cpi_yoy DECIMAL(8,4),
      num_brackets    INTEGER,
      total_volume    BIGINT
    )`;

  await sql`CREATE INDEX IF NOT EXISTS idx_kalshi_fetched ON kalshi_ticks (fetched_at DESC)`;

  await sql`
    CREATE TABLE IF NOT EXISTS fred_observations (
      id              SERIAL PRIMARY KEY,
      fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      series_id       TEXT NOT NULL,
      obs_date        DATE NOT NULL,
      value           DECIMAL(8,4) NOT NULL,
      UNIQUE(series_id, obs_date)
    )`;

  await sql`CREATE INDEX IF NOT EXISTS idx_fred_series_date ON fred_observations (series_id, obs_date DESC)`;

  await sql`
    CREATE TABLE IF NOT EXISTS oracle_values_v2 (
      id                      SERIAL PRIMARY KEY,
      computed_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      oracle_v2               DECIMAL(8,4) NOT NULL,
      oracle_v1               DECIMAL(8,4) NOT NULL,
      w_cpi                   DECIMAL(4,2) NOT NULL DEFAULT 0.35,
      w_kalshi                DECIMAL(4,2) NOT NULL DEFAULT 0.30,
      w_tips                  DECIMAL(4,2) NOT NULL DEFAULT 0.20,
      w_polymarket            DECIMAL(4,2) NOT NULL DEFAULT 0.15,
      cpi_yoy                 DECIMAL(8,4) NOT NULL,
      kalshi_implied_cpi      DECIMAL(8,4),
      tips_breakeven          DECIMAL(8,4),
      polymarket_impl_infl    DECIMAL(8,4) NOT NULL,
      polymarket_tick_id      INTEGER REFERENCES polymarket_ticks(id),
      kalshi_tick_id          INTEGER REFERENCES kalshi_ticks(id),
      prob_no_change          DECIMAL(6,4),
      prob_cut_25             DECIMAL(6,4),
      prob_cut_50             DECIMAL(6,4),
      prob_hike_25            DECIMAL(6,4)
    )`;

  await sql`CREATE INDEX IF NOT EXISTS idx_oracle_v2_computed ON oracle_values_v2 (computed_at DESC)`;
}

// --- Polymarket tick storage (unchanged) ---

export async function storeTick(probs: PolymarketProbs) {
  const result = await sql`
    INSERT INTO polymarket_ticks (prob_no_change, prob_cut_25, prob_cut_50, prob_hike_25, raw_prices, event_slug)
    VALUES (${probs.prob_no_change}, ${probs.prob_cut_25}, ${probs.prob_cut_50}, ${probs.prob_hike_25}, ${JSON.stringify(probs.raw_prices)}, ${probs.event_slug})
    RETURNING *`;
  return result.rows[0];
}

// --- V1 Oracle storage (unchanged) ---

export async function storeOracleValue(tickId: number, oracle: OracleResult) {
  const result = await sql`
    INSERT INTO oracle_values (tick_id, oracle_value, implied_rate_change, implied_inflation, alpha, cpi_yoy_used, cpi_index_used, prob_no_change, prob_cut_25, prob_cut_50, prob_hike_25)
    VALUES (${tickId}, ${oracle.oracle_value}, ${oracle.implied_rate_change}, ${oracle.implied_inflation}, ${oracle.alpha}, ${oracle.cpi_yoy_used}, ${oracle.cpi_index_used}, ${oracle.prob_no_change}, ${oracle.prob_cut_25}, ${oracle.prob_cut_50}, ${oracle.prob_hike_25})
    RETURNING *`;
  return result.rows[0];
}

export async function getRecentOracle(seconds: number = 50) {
  const result = await sql`
    SELECT * FROM oracle_values
    WHERE computed_at > NOW() - INTERVAL '1 second' * ${seconds}
    ORDER BY computed_at DESC LIMIT 1`;
  return result.rows;
}

export async function getLastNOracle(n: number = 10) {
  const result = await sql`
    SELECT * FROM oracle_values ORDER BY computed_at DESC LIMIT ${n}`;
  return result.rows;
}

export async function getOracleCount() {
  const result = await sql`SELECT COUNT(*) as count FROM oracle_values`;
  return parseInt(result.rows[0].count, 10);
}

export async function getHistoryCount() {
  const result = await sql`SELECT COUNT(*) as count FROM polymarket_history`;
  return parseInt(result.rows[0].count, 10);
}

export async function bulkInsertHistory(points: HistoryPoint[]) {
  for (const p of points) {
    await sql`
      INSERT INTO polymarket_history (timestamp, prob_no_change, prob_cut_25, prob_cut_50, prob_hike_25, oracle_value, source)
      VALUES (${p.timestamp}, ${p.prob_no_change}, ${p.prob_cut_25}, ${p.prob_cut_50}, ${p.prob_hike_25}, ${p.oracle_value}, ${p.source})
      ON CONFLICT (timestamp) DO NOTHING`;
  }
}

export async function getHistory() {
  const result = await sql`
    SELECT * FROM polymarket_history ORDER BY timestamp ASC`;
  return result.rows;
}

export async function getLiveOracleAfter(after: string) {
  const result = await sql`
    SELECT computed_at as timestamp, oracle_value, prob_no_change, prob_cut_25, prob_cut_50, prob_hike_25
    FROM oracle_values
    WHERE computed_at > ${after}::timestamptz
    ORDER BY computed_at ASC`;
  return result.rows;
}

export async function getLatestCpi() {
  const result = await sql`
    SELECT * FROM cpi_prints ORDER BY year DESC, period DESC LIMIT 1`;
  return result.rows[0] || null;
}

export async function getCpiStaleness() {
  const result = await sql`
    SELECT fetched_at FROM cpi_prints ORDER BY fetched_at DESC LIMIT 1`;
  if (result.rows.length === 0) return Infinity;
  const fetched = new Date(result.rows[0].fetched_at).getTime();
  return (Date.now() - fetched) / 1000 / 3600; // hours
}

export async function upsertCpiPrint(print: {
  series_id: string;
  year: number;
  period: string;
  period_name: string;
  index_value: number;
  yoy_pct: number | null;
  mom_pct: number | null;
}) {
  await sql`
    INSERT INTO cpi_prints (series_id, year, period, period_name, index_value, yoy_pct, mom_pct)
    VALUES (${print.series_id}, ${print.year}, ${print.period}, ${print.period_name}, ${print.index_value}, ${print.yoy_pct}, ${print.mom_pct})
    ON CONFLICT (series_id, year, period) DO UPDATE SET
      index_value = EXCLUDED.index_value,
      yoy_pct = EXCLUDED.yoy_pct,
      mom_pct = EXCLUDED.mom_pct,
      fetched_at = NOW()`;
}

// --- Kalshi tick storage ---

export async function storeKalshiTick(result: KalshiResult) {
  const row = await sql`
    INSERT INTO kalshi_ticks (event_ticker, markets_json, implied_cpi_yoy, num_brackets, total_volume)
    VALUES (${result.event_ticker}, ${JSON.stringify(result.markets_json)}, ${result.implied_cpi_yoy}, ${result.num_brackets}, ${result.total_volume})
    RETURNING *`;
  return row.rows[0];
}

export async function getLatestKalshiTick() {
  const result = await sql`
    SELECT * FROM kalshi_ticks ORDER BY fetched_at DESC LIMIT 1`;
  return result.rows[0] || null;
}

// --- FRED observation storage ---

export async function upsertFredObservation(obs: FredObservation) {
  await sql`
    INSERT INTO fred_observations (series_id, obs_date, value)
    VALUES (${obs.series_id}, ${obs.obs_date}, ${obs.value})
    ON CONFLICT (series_id, obs_date) DO UPDATE SET
      value = EXCLUDED.value,
      fetched_at = NOW()`;
}

export async function upsertFredObservations(observations: FredObservation[]) {
  for (const obs of observations) {
    await upsertFredObservation(obs);
  }
}

export async function getFredStaleness(): Promise<number> {
  const result = await sql`
    SELECT fetched_at FROM fred_observations ORDER BY fetched_at DESC LIMIT 1`;
  if (result.rows.length === 0) return Infinity;
  const fetched = new Date(result.rows[0].fetched_at).getTime();
  return (Date.now() - fetched) / 1000 / 3600; // hours
}

export async function getLatestFredBySeriesId(seriesId: string) {
  const result = await sql`
    SELECT * FROM fred_observations
    WHERE series_id = ${seriesId}
    ORDER BY obs_date DESC LIMIT 1`;
  return result.rows[0] || null;
}

export async function getLatestFredAll() {
  const series = ['T5YIE', 'T10YIE', 'T5YIFR', 'EXPINF1YR', 'EXPINF10YR'];
  const results: Record<string, { series_id: string; obs_date: string; value: number } | null> = {};
  for (const s of series) {
    const row = await getLatestFredBySeriesId(s);
    results[s] = row ? { series_id: row.series_id, obs_date: row.obs_date, value: parseFloat(row.value) } : null;
  }
  return results;
}

// --- V2 Oracle storage ---

export async function storeOracleV2(v2: OracleV2Result) {
  const result = await sql`
    INSERT INTO oracle_values_v2 (
      oracle_v2, oracle_v1,
      w_cpi, w_kalshi, w_tips, w_polymarket,
      cpi_yoy, kalshi_implied_cpi, tips_breakeven, polymarket_impl_infl,
      polymarket_tick_id, kalshi_tick_id,
      prob_no_change, prob_cut_25, prob_cut_50, prob_hike_25
    ) VALUES (
      ${v2.oracle_v2}, ${v2.oracle_v1},
      ${v2.weights.cpi}, ${v2.weights.kalshi}, ${v2.weights.tips}, ${v2.weights.polymarket},
      ${v2.cpi_yoy}, ${v2.kalshi_implied_cpi}, ${v2.tips_breakeven}, ${v2.polymarket_impl_infl},
      ${v2.polymarket_tick_id}, ${v2.kalshi_tick_id},
      ${v2.prob_no_change}, ${v2.prob_cut_25}, ${v2.prob_cut_50}, ${v2.prob_hike_25}
    ) RETURNING *`;
  return result.rows[0];
}

export async function getRecentOracleV2(seconds: number = 50) {
  const result = await sql`
    SELECT * FROM oracle_values_v2
    WHERE computed_at > NOW() - INTERVAL '1 second' * ${seconds}
    ORDER BY computed_at DESC LIMIT 1`;
  return result.rows;
}

export async function getLastNOracleV2(n: number = 10): Promise<OracleV2Row[]> {
  const result = await sql`
    SELECT * FROM oracle_values_v2 ORDER BY computed_at DESC LIMIT ${n}`;
  return result.rows as OracleV2Row[];
}

export async function getOracleV2Count() {
  const result = await sql`SELECT COUNT(*) as count FROM oracle_values_v2`;
  return parseInt(result.rows[0].count, 10);
}
