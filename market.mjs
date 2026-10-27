import {validateBars} from './analysis.mjs';

const pairs = {BTCUSD: 'XBTUSD', ETHUSD: 'ETHUSD'};
const intervals = {M5: 5, M15: 15, H1: 60, H4: 240};

export class MarketError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}

// Bounded keys, request coalescing, and a short cache limit upstream requests.
export function createMarketLoader({fetchImpl = fetch, now = Date.now} = {}) {
  const cache = new Map(), pending = new Map();
  return async function loadMarket(symbol = 'BTCUSD', timeframe = 'M5') {
    if (!Object.hasOwn(pairs, symbol) || !Object.hasOwn(intervals, timeframe)) {
      throw new MarketError('Choose BTCUSD or ETHUSD and M5, M15, H1, or H4.', 400);
    }
    const key = `${symbol}/${timeframe}`, saved = cache.get(key);
    if (saved && now() - saved.at < 60_000) return saved.data;
    if (pending.has(key)) return pending.get(key);
    const request = (async () => {
      try {
        const url = new URL('https://api.kraken.com/0/public/OHLC');
        url.searchParams.set('pair', pairs[symbol]);
        url.searchParams.set('interval', intervals[timeframe]);
        const response = await fetchImpl(url, {signal: AbortSignal.timeout(10_000), redirect: 'error'});
        if (!response.ok) throw new MarketError(response.status === 429
          ? 'The market provider is rate-limiting requests. Try again later.'
          : 'Market candles are unavailable from Kraken. Try again later.');
        const payload = await response.json();
        if (!Array.isArray(payload.error) || payload.error.length || !payload.result) {
          throw new MarketError('Kraken could not return candles for this market.');
        }
        const rows = Object.entries(payload.result).find(([name]) => name !== 'last')?.[1];
        if (!Array.isArray(rows) || rows.length > 1000) throw new MarketError('The market provider returned invalid candles.');
        // Kraken's last row is the still-forming candle; never analyze it as closed.
        const duration = intervals[timeframe] * 60_000;
        const bars = validateBars(rows.slice(0, -1).map(row => {
          if (!Array.isArray(row) || row.length < 5) throw new MarketError('The market provider returned invalid candles.');
          return {time: Number(row[0]) * 1000, open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4])};
        }).filter(bar => bar.time + duration <= now()).slice(-180));
        const data = {bars, symbol, timeframe, source: 'market', provider: 'Kraken',
          fetchedAt: new Date(now()).toISOString(), lastClosedAt: new Date(bars.at(-1).time + duration).toISOString()};
        cache.set(key, {at: now(), data});
        return data;
      } catch (error) {
        if (error instanceof MarketError) throw error;
        throw new MarketError('Unable to load valid market candles. Try again, or use CSV or demo data.');
      }
    })();
    pending.set(key, request);
    try { return await request; } finally { pending.delete(key); }
  };
}
