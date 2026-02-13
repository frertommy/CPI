import { PolymarketProbs, OracleResult, OracleV2Result } from './types';

const ALPHA = 0.80;

// V2 weights
const W_CPI = 0.35;
const W_KALSHI = 0.30;
const W_TIPS = 0.20;
const W_POLYMARKET = 0.15;

// Default CPI YoY — updated when we fetch from BLS
let cachedCpiYoy = 2.7;
let cachedCpiIndex: number | null = 324.054;

export function setCpiBaseline(yoy: number, index: number | null) {
  cachedCpiYoy = yoy;
  cachedCpiIndex = index;
}

export function getCpiBaseline() {
  return { yoy: cachedCpiYoy, index: cachedCpiIndex };
}

// --- V1 Oracle (unchanged) ---

export function computeOracle(probs: PolymarketProbs, cpiYoy?: number, cpiIndex?: number | null): OracleResult {
  const yoy = cpiYoy ?? cachedCpiYoy;
  const idx = cpiIndex !== undefined ? cpiIndex : cachedCpiIndex;

  // Step A: Implied rate change in basis points
  const implied_rate_change =
    (probs.prob_cut_50 * -50) +
    (probs.prob_cut_25 * -25) +
    (probs.prob_no_change * 0) +
    (probs.prob_hike_25 * 25);

  // Step B: Implied inflation
  const hawk_lean = -implied_rate_change / 25;
  const implied_inflation = yoy + hawk_lean * 0.3;

  // Step C: Oracle composite
  const oracle_value = ALPHA * yoy + (1 - ALPHA) * implied_inflation;

  return {
    oracle_value: Math.round(oracle_value * 10000) / 10000,
    implied_rate_change: Math.round(implied_rate_change * 10000) / 10000,
    implied_inflation: Math.round(implied_inflation * 10000) / 10000,
    alpha: ALPHA,
    cpi_yoy_used: yoy,
    cpi_index_used: idx,
    prob_no_change: probs.prob_no_change,
    prob_cut_25: probs.prob_cut_25,
    prob_cut_50: probs.prob_cut_50,
    prob_hike_25: probs.prob_hike_25,
  };
}

export function computeOracleFromProbs(
  probNoChange: number,
  probCut25: number,
  probCut50: number,
  probHike25: number,
  cpiYoy: number = cachedCpiYoy
): number {
  const implied_rate_change =
    (probCut50 * -50) + (probCut25 * -25) + (probNoChange * 0) + (probHike25 * 25);
  const hawk_lean = -implied_rate_change / 25;
  const implied_inflation = cpiYoy + hawk_lean * 0.3;
  const oracle_value = ALPHA * cpiYoy + (1 - ALPHA) * implied_inflation;
  return Math.round(oracle_value * 10000) / 10000;
}

// --- V2 Oracle ---

export interface V2Inputs {
  cpiYoy: number;
  kalshiImpliedCpi: number | null;
  tipsBreakeven: number | null;
  polymarketImpliedInflation: number;
  polymarketTickId: number | null;
  kalshiTickId: number | null;
  probs: PolymarketProbs;
  oracleV1: number;
}

export function computeOracleV2(inputs: V2Inputs): OracleV2Result {
  const {
    cpiYoy,
    kalshiImpliedCpi,
    tipsBreakeven,
    polymarketImpliedInflation,
    polymarketTickId,
    kalshiTickId,
    probs,
    oracleV1,
  } = inputs;

  const sourcesActive: string[] = ['cpi', 'polymarket'];
  let wCpi = W_CPI;
  let wKalshi = W_KALSHI;
  let wTips = W_TIPS;
  const wPolymarket = W_POLYMARKET;

  // Validate source values — treat zero, null, or out-of-range as unavailable
  const kalshiAvailable = kalshiImpliedCpi !== null &&
    kalshiImpliedCpi > 1.0 && kalshiImpliedCpi < 5.0;
  const tipsAvailable = tipsBreakeven !== null &&
    tipsBreakeven > 0.5 && tipsBreakeven < 5.0;

  if (!kalshiAvailable && !tipsAvailable) {
    wCpi = W_CPI + W_KALSHI + W_TIPS;
    wKalshi = 0;
    wTips = 0;
  } else if (!kalshiAvailable) {
    sourcesActive.push('tips');
    wCpi = W_CPI + W_KALSHI;
    wKalshi = 0;
  } else if (!tipsAvailable) {
    sourcesActive.push('kalshi');
    wCpi = W_CPI + W_TIPS;
    wTips = 0;
  } else {
    sourcesActive.push('kalshi', 'tips');
  }

  let oracleV2 = wCpi * cpiYoy + wPolymarket * polymarketImpliedInflation;
  if (kalshiAvailable) oracleV2 += wKalshi * kalshiImpliedCpi!;
  if (tipsAvailable) oracleV2 += wTips * tipsBreakeven!;

  oracleV2 = Math.round(oracleV2 * 10000) / 10000;

  return {
    oracle_v2: oracleV2,
    oracle_v1: oracleV1,
    cpi_yoy: cpiYoy,
    kalshi_implied_cpi: kalshiImpliedCpi,
    tips_breakeven: tipsBreakeven,
    polymarket_impl_infl: polymarketImpliedInflation,
    weights: { cpi: wCpi, kalshi: wKalshi, tips: wTips, polymarket: wPolymarket },
    sources_active: sourcesActive,
    polymarket_tick_id: polymarketTickId,
    kalshi_tick_id: kalshiTickId,
    prob_no_change: probs.prob_no_change,
    prob_cut_25: probs.prob_cut_25,
    prob_cut_50: probs.prob_cut_50,
    prob_hike_25: probs.prob_hike_25,
  };
}

export function computePolymarketImpliedInflation(probs: PolymarketProbs, cpiYoy: number): number {
  const implied_rate_change =
    (probs.prob_cut_50 * -50) +
    (probs.prob_cut_25 * -25) +
    (probs.prob_no_change * 0) +
    (probs.prob_hike_25 * 25);
  const hawk_lean = -implied_rate_change / 25;
  return Math.round((cpiYoy + hawk_lean * 0.3) * 10000) / 10000;
}
