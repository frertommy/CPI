import { KalshiMarket, KalshiBracket, KalshiResult } from './types';

const KALSHI_API = 'https://api.elections.kalshi.com/trade-api/v2';
const SERIES_TICKER = 'KXCPIYOY';

export async function fetchKalshiCpiMarkets(): Promise<KalshiResult> {
  const url = `${KALSHI_API}/markets?series_ticker=${SERIES_TICKER}&status=open&limit=100`;
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`Kalshi API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const markets: KalshiMarket[] = data.markets || [];

  if (markets.length === 0) {
    return {
      event_ticker: SERIES_TICKER,
      markets_json: [],
      implied_cpi_yoy: null,
      num_brackets: 0,
      total_volume: 0,
      brackets: [],
    };
  }

  // Find the most common event_ticker (most recent event)
  const eventCounts = new Map<string, number>();
  for (const m of markets) {
    eventCounts.set(m.event_ticker, (eventCounts.get(m.event_ticker) || 0) + 1);
  }
  let bestEvent = markets[0].event_ticker;
  let bestCount = 0;
  for (const [ev, count] of eventCounts) {
    if (count > bestCount) {
      bestEvent = ev;
      bestCount = count;
    }
  }

  // Filter to the main event's markets
  const eventMarkets = markets.filter((m) => m.event_ticker === bestEvent);

  // Parse brackets from tickers
  const brackets: KalshiBracket[] = [];
  let totalVolume = 0;

  for (const m of eventMarkets) {
    const threshold = parseThreshold(m.ticker);
    if (threshold === null) continue;

    // Get probability: prefer last_price, fallback to mid of bid/ask
    let probability = 0;
    if (m.last_price && m.last_price > 0) {
      probability = m.last_price / 100;
    } else if (m.yes_bid > 0 || m.yes_ask > 0) {
      probability = ((m.yes_bid || 0) + (m.yes_ask || 0)) / 2 / 100;
    } else {
      continue; // Skip if no price data at all
    }

    brackets.push({
      threshold,
      probability,
      ticker: m.ticker,
      volume: m.volume || 0,
    });

    totalVolume += m.volume || 0;
  }

  // Sort brackets by threshold ascending
  brackets.sort((a, b) => a.threshold - b.threshold);

  // Compute implied CPI YoY
  const impliedCpi = computeImpliedCpi(brackets);

  return {
    event_ticker: bestEvent,
    markets_json: eventMarkets,
    implied_cpi_yoy: impliedCpi,
    num_brackets: brackets.length,
    total_volume: totalVolume,
    brackets,
  };
}

function parseThreshold(ticker: string): number | null {
  // KXCPIYOY-26JAN-T2.9 → 2.9
  const parts = ticker.split('-T');
  if (parts.length < 2) return null;
  const num = parseFloat(parts[1]);
  return isNaN(num) ? null : num;
}

function computeImpliedCpi(brackets: KalshiBracket[]): number | null {
  if (brackets.length < 2) return null;

  // Brackets are cumulative: P(CPI >= threshold)
  // Sorted ascending by threshold
  // P(CPI in [t_i, t_{i+1})) = P(>=t_i) - P(>=t_{i+1})

  let expectedCpi = 0;
  let totalProb = 0;

  for (let i = 0; i < brackets.length; i++) {
    const currentThreshold = brackets[i].threshold;
    const currentProb = brackets[i].probability;

    let bracketProb: number;
    let midpoint: number;

    if (i < brackets.length - 1) {
      const nextThreshold = brackets[i + 1].threshold;
      const nextProb = brackets[i + 1].probability;
      bracketProb = currentProb - nextProb;
      midpoint = (currentThreshold + nextThreshold) / 2;
    } else {
      // Highest bracket: probability of being >= last threshold
      bracketProb = currentProb;
      midpoint = currentThreshold + 0.1;
    }

    // Handle negative bracket probabilities (market noise)
    if (bracketProb < 0) bracketProb = 0;

    expectedCpi += bracketProb * midpoint;
    totalProb += bracketProb;
  }

  // Add the "below lowest threshold" bracket
  const lowestProb = 1 - brackets[0].probability;
  if (lowestProb > 0) {
    const floorMidpoint = brackets[0].threshold - 0.1;
    expectedCpi += lowestProb * floorMidpoint;
    totalProb += lowestProb;
  }

  // Normalize (should be close to 1.0 already)
  if (totalProb > 0) {
    expectedCpi = expectedCpi / totalProb;
  }

  return Math.round(expectedCpi * 10000) / 10000;
}
