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

export interface V2HistoryPoint {
  timestamp: string;
  oracle_v2: number;
  oracle_v1: number;
  kalshi_implied_cpi: number | null;
  tips_breakeven: number | null;
  polymarket_impl_infl: number;
}

export interface DashboardState {
  current: OracleRow | null;
  feed: OracleRow[];
  history: HistoryPoint[];
  v2History: V2HistoryPoint[];
  cpi: CpiResponse | null;
  status: 'loading' | 'live' | 'error' | 'stale';
  error: string | null;
  tickCount: number;
  lastTick: string | null;
  v2: OracleV2Current | null;
  kalshiBrackets: KalshiBracket[];
  fredData: FredLatestResponse | null;
}

// --- V2 Types ---

export interface KalshiMarket {
  ticker: string;
  event_ticker: string;
  title: string;
  subtitle: string;
  yes_bid: number;
  yes_ask: number;
  last_price: number;
  volume: number;
  status: string;
  close_time: string;
  result: string;
}

export interface KalshiBracket {
  threshold: number;
  probability: number;
  ticker: string;
  volume: number;
}

export interface KalshiResult {
  event_ticker: string;
  markets_json: KalshiMarket[];
  implied_cpi_yoy: number | null;
  num_brackets: number;
  total_volume: number;
  brackets: KalshiBracket[];
}

export interface FredObservation {
  series_id: string;
  obs_date: string;
  value: number;
}

export interface FredLatestResponse {
  T5YIE: FredObservation | null;
  T10YIE: FredObservation | null;
  T5YIFR: FredObservation | null;
  EXPINF1YR: FredObservation | null;
  EXPINF10YR: FredObservation | null;
}

export interface OracleV2Result {
  oracle_v2: number;
  oracle_v1: number;
  cpi_yoy: number;
  kalshi_implied_cpi: number | null;
  tips_breakeven: number | null;
  polymarket_impl_infl: number;
  weights: { cpi: number; kalshi: number; tips: number; polymarket: number };
  sources_active: string[];
  polymarket_tick_id: number | null;
  kalshi_tick_id: number | null;
  prob_no_change: number;
  prob_cut_25: number;
  prob_cut_50: number;
  prob_hike_25: number;
}

export interface OracleV2Row {
  id: number;
  computed_at: string;
  oracle_v2: string;
  oracle_v1: string;
  w_cpi: string;
  w_kalshi: string;
  w_tips: string;
  w_polymarket: string;
  cpi_yoy: string;
  kalshi_implied_cpi: string | null;
  tips_breakeven: string | null;
  polymarket_impl_infl: string;
  polymarket_tick_id: number | null;
  kalshi_tick_id: number | null;
  prob_no_change: string | null;
  prob_cut_25: string | null;
  prob_cut_50: string | null;
  prob_hike_25: string | null;
}

export interface OracleV2Current {
  oracle_v2: number;
  oracle_v1: number;
  cpi_yoy: number;
  kalshi_implied_cpi: number | null;
  tips_breakeven: number | null;
  polymarket_impl_infl: number;
  weights: { cpi: number; kalshi: number; tips: number; polymarket: number };
  sources_active: string[];
}
