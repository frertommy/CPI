export interface PolymarketProbs {
  prob_no_change: number;
  prob_cut_25: number;
  prob_cut_50: number;
  prob_hike_25: number;
  raw_prices: Record<string, number>;
  event_slug: string;
}

export interface OracleResult {
  oracle_value: number;
  implied_rate_change: number;
  implied_inflation: number;
  alpha: number;
  cpi_yoy_used: number;
  cpi_index_used: number | null;
  prob_no_change: number;
  prob_cut_25: number;
  prob_cut_50: number;
  prob_hike_25: number;
}

export interface OracleRow {
  id: number;
  computed_at: string;
  tick_id: number;
  oracle_value: string;
  implied_rate_change: string;
  implied_inflation: string;
  alpha: string;
  cpi_yoy_used: string;
  cpi_index_used: string | null;
  prob_no_change: string;
  prob_cut_25: string;
  prob_cut_50: string;
  prob_hike_25: string;
}

export interface TickRow {
  id: number;
  fetched_at: string;
  prob_no_change: string;
  prob_cut_25: string;
  prob_cut_50: string;
  prob_hike_25: string;
  raw_prices: Record<string, number>;
  event_slug: string;
  market_status: string;
}

export interface CpiPrint {
  id: number;
  fetched_at: string;
  series_id: string;
  year: number;
  period: string;
  period_name: string;
  index_value: string;
  yoy_pct: string | null;
  mom_pct: string | null;
}

export interface HistoryPoint {
  timestamp: string;
  prob_no_change: number | null;
  prob_cut_25: number | null;
  prob_cut_50: number | null;
  prob_hike_25: number | null;
  oracle_value: number | null;
  source: string;
}

export interface MarketMeta {
  question: string;
  bps: number;
  yesTokenId: string;
  conditionId: string;
}

export interface LiveResponse {
  current: OracleRow;
  feed: OracleRow[];
}

export interface HistoryResponse {
  history: HistoryPoint[];
}

export interface CpiResponse {
  latest: CpiPrint | null;
  yoy_pct: number;
  index_value: number;
  print_date: string;
}

export interface DashboardState {
  current: OracleRow | null;
  feed: OracleRow[];
  history: HistoryPoint[];
  cpi: CpiResponse | null;
  status: 'loading' | 'live' | 'error' | 'stale';
  error: string | null;
  tickCount: number;
  lastTick: string | null;
}
