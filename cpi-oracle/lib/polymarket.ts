import { MarketMeta, PolymarketProbs } from './types';

const GAMMA_API = 'https://gamma-api.polymarket.com';
const CLOB_API = 'https://clob.polymarket.com';
const EVENT_SLUG = 'fed-decision-in-march-885';

let cachedMarkets: MarketMeta[] | null = null;

function mapQuestionToBps(question: string): number | null {
  const q = question.toLowerCase();
  if (q.includes('50') && q.includes('decrease')) return -50;
  if (q.includes('25') && q.includes('decrease')) return -25;
  if (q.includes('no change')) return 0;
  if (q.includes('increase')) return 25;
  return null;
}

export async function fetchMarketMeta(): Promise<MarketMeta[]> {
  if (cachedMarkets) return cachedMarkets;

  const res = await fetch(`${GAMMA_API}/events?slug=${EVENT_SLUG}`, {
    next: { revalidate: 300 },
  });

  if (!res.ok) {
    throw new Error(`Gamma API error: ${res.status} ${res.statusText}`);
  }

  const events = await res.json();
  const event = events[0];
  if (!event || !event.markets) {
    throw new Error('No event found for slug: ' + EVENT_SLUG);
  }

  const markets: MarketMeta[] = [];
  for (const m of event.markets) {
    const bps = mapQuestionToBps(m.question);
    if (bps === null) continue;

    const tokenIds = JSON.parse(m.clobTokenIds);
    markets.push({
      question: m.question,
      bps,
      yesTokenId: tokenIds[0],
      conditionId: m.conditionId,
    });
  }

  cachedMarkets = markets;
  return markets;
}

export async function fetchLivePrice(tokenId: string): Promise<number> {
  const res = await fetch(`${CLOB_API}/price?token_id=${tokenId}&side=buy`);
  if (!res.ok) {
    throw new Error(`CLOB price error: ${res.status}`);
  }
  const data = await res.json();
  return parseFloat(data.price);
}

export async function fetchAllPrices(): Promise<PolymarketProbs> {
  const markets = await fetchMarketMeta();

  const prices: Record<string, number> = {};
  let probNoChange = 0;
  let probCut25 = 0;
  let probCut50 = 0;
  let probHike25 = 0;

  await Promise.all(
    markets.map(async (m) => {
      const price = await fetchLivePrice(m.yesTokenId);
      prices[m.question] = price;

      switch (m.bps) {
        case 0:
          probNoChange = price;
          break;
        case -25:
          probCut25 = price;
          break;
        case -50:
          probCut50 = price;
          break;
        case 25:
          probHike25 = price;
          break;
      }
    })
  );

  return {
    prob_no_change: probNoChange,
    prob_cut_25: probCut25,
    prob_cut_50: probCut50,
    prob_hike_25: probHike25,
    raw_prices: prices,
    event_slug: EVENT_SLUG,
  };
}

export async function fetchPriceHistory(conditionId: string): Promise<{ t: number; p: number }[]> {
  const res = await fetch(
    `${CLOB_API}/prices-history?market=${conditionId}&interval=max&fidelity=60`
  );
  if (!res.ok) {
    throw new Error(`CLOB history error: ${res.status}`);
  }
  const data = await res.json();
  return (data.history || []).map((h: { t: number; p: string }) => ({
    t: h.t,
    p: parseFloat(h.p),
  }));
}

export function clearMarketCache() {
  cachedMarkets = null;
}
