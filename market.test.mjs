import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMarketLoader} from './market.mjs';
import {createServer} from './server.mjs';

const start = 1_700_000_100_000;
const rows = Array.from({length: 21}, (_, i) => [(start + i * 300_000) / 1000, '100', '103', '99', '102', '101', '2', 12]);
const payload = () => ({error: [], result: {XXBTZUSD: rows.map(r => [...r]), last: 123}});

test('normalizes Kraken data, excludes the forming candle, and coalesces and caches requests', async () => {
  let time = start + 20 * 300_000 + 1000, calls = 0;
  const loader = createMarketLoader({now: () => time, fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url.origin, 'https://api.kraken.com');
    assert.equal(url.searchParams.get('pair'), 'XBTUSD');
    assert.equal(url.searchParams.get('interval'), '5');
    assert(options.signal); assert.equal(options.redirect, 'error');
    return {ok: true, json: async () => payload()};
  }});
  const [a, b] = await Promise.all([loader('BTCUSD', 'M5'), loader('BTCUSD', 'M5')]);
  assert.deepEqual(a, b); assert.equal(calls, 1);
  assert.equal(a.bars.length, 20); assert.equal(a.bars[0].time, start);
  assert.equal(a.bars[0].close, 102); assert.equal(a.provider, 'Kraken');
  assert.equal(a.lastClosedAt, new Date(start + 20 * 300_000).toISOString());
  await loader(); assert.equal(calls, 1);
  time += 60_001; await loader(); assert.equal(calls, 2);
  await assert.rejects(loader('https://example.com', 'M5'), {status: 400});
  await assert.rejects(loader('BTCUSD', 'M1'), {status: 400});
  assert.equal(calls, 2);
});

test('rejects unavailable, malformed, and insufficient data without inventing a fallback', async () => {
  for (const reply of [
    {ok: false, status: 429},
    {ok: true, json: async () => ({error: ['Unavailable']})},
    {ok: true, json: async () => ({error: [], result: {last: 1}})},
    {ok: true, json: async () => {const p=payload();p.result.XXBTZUSD[2][3]='999';return p}},
    {ok: true, json: async () => ({error: [], result: {XXBTZUSD: rows.slice(0, 5)}})},
  ]) {
    const loader = createMarketLoader({now: () => start + 21 * 300_000, fetchImpl: async () => reply});
    await assert.rejects(loader(), {status: 502});
  }
  let calls = 0;
  const loader = createMarketLoader({fetchImpl: async () => {calls++;throw Error('secret upstream details')}});
  await assert.rejects(loader(), /Unable to load valid market candles/);
  await assert.rejects(loader(), /Unable to load valid market candles/);
  assert.equal(calls, 2); // Failures are not cached as valid prices.
});

test('HTTP market route returns provenance and errors; server files stay private', async () => {
  const server = createServer({fetchMarket: async (symbol, timeframe) => {
    if(symbol==='BAD') throw Object.assign(Error('Unsupported market'), {status: 400});
    return {symbol, timeframe, provider: 'fixture', bars: []};
  }});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = 'http://127.0.0.1:' + server.address().port;
    const data = await (await fetch(base + '/api/market/candles?symbol=ETHUSD&timeframe=H1')).json();
    assert.equal(data.symbol, 'ETHUSD'); assert.equal(data.timeframe, 'H1'); assert.equal(data.provider, 'fixture');
    const bad = await fetch(base + '/api/market/candles?symbol=BAD');
    assert.equal(bad.status, 400); assert.equal((await bad.json()).error, 'Unsupported market');
    assert.equal((await fetch(base + '/market.mjs')).status, 404);
  } finally {server.closeAllConnections();await new Promise(resolve => server.close(resolve));}
});
