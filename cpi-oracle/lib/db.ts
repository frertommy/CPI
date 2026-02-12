import { sql } from '@vercel/postgres';
import { PolymarketProbs, OracleResult, HistoryPoint } from './types';

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
}

export async function storeTick(probs: PolymarketProbs) {
  const result = await sql`
    INSERT INTO polymarket_ticks (prob_no_change, prob_cut_25, prob_cut_50, prob_hike_25, raw_prices, event_slug)
    VALUES (${probs.prob_no_change}, ${probs.prob_cut_25}, ${probs.prob_cut_50}, ${probs.prob_hike_25}, ${JSON.stringify(probs.raw_prices)}, ${probs.event_slug})
    RETURNING *`;
  return result.rows[0];
}

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
