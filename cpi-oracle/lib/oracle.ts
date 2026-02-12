import { PolymarketProbs, OracleResult } from './types';

const ALPHA = 0.80;

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
