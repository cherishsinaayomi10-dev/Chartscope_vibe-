import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMarketLoader,createMarketService} from './market.mjs';
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
  await assert.rejects(loader(), /Unable to contact Kraken/);
  await assert.rejects(loader(), /Unable to contact Kraken/);
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

test('discovers all online Kraken pairs, supports non-USD quotes and aliases, and caches discovery',async()=>{
 let catalogs=0, candles=0;
 const markets=createMarketService({now:()=>start+21*300000,fetchImpl:async url=>({ok:true,json:async()=>{
  if(url.pathname.endsWith('AssetPairs')){catalogs++;return {error:[],result:{SOLUSD:{altname:'SOLUSD',wsname:'SOL/USD',status:'online'},SOLEUR:{altname:'SOLEUR',wsname:'SOL/EUR',status:'online'},XXBTZEUR:{altname:'XBTEUR',wsname:'XBT/EUR',status:'online'},EURGBP:{altname:'EURGBP',wsname:'EUR/GBP',status:'online'},OFF:{altname:'OFFUSD',wsname:'OFF/USD',status:'cancel_only'},'SOLUSD.d':{altname:'SOLUSD.d',wsname:'SOL/USD',status:'online'}}}}
  candles++;assert(['SOLEUR','XBTEUR'].includes(url.searchParams.get('pair')));return payload();
 }})});
 const list=await markets.catalog();assert.equal(list.warnings.length,0);
 assert(list.pairs.some(p=>p.symbol==='SOLEUR'&&p.feed==='kraken'));
 assert(list.pairs.some(p=>p.symbol==='EURGBP'&&p.group==='forex'));
 assert(!list.pairs.some(p=>p.symbol==='OFFUSD'));
 await markets.load('SOL/EUR','M5');assert.equal((await markets.load('XBTEUR','M5')).symbol,'BTCEUR');
 assert.equal(catalogs,1);assert.equal(candles,2);
 await assert.rejects(markets.load('FAKEUSD','M5'),{status:400});
 assert.equal(candles,2);
});

function yahooPayload({symbol='EURGBP=X',count=61,step=300000,origin=start}={}) {
 return {chart:{error:null,result:[{meta:{symbol,currency:'GBP',instrumentType:'CURRENCY',exchangeName:'CCY'},timestamp:Array.from({length:count},(_,i)=>(origin+i*step)/1000),indicators:{quote:[{open:Array(count).fill(.85),high:Array(count).fill(.87),low:Array(count).fill(.84),close:Array(count).fill(.86)}]}}]}};
}

test('loads forex and arbitrary Yahoo symbols, preserving the data source and excluding unfinished candles',async()=>{
 let requested=[];
 const markets=createMarketService({now:()=>start+60*300000+1000,fetchImpl:async url=>{
  requested.push(decodeURIComponent(url.pathname.split('/').at(-1)));
  assert.equal(url.origin,'https://query1.finance.yahoo.com');
  return {ok:true,json:async()=>yahooPayload()};
 }});
 const data=await markets.load('EUR/GBP','M5','yahoo');
 assert.equal(data.symbol,'EURGBP=X');assert.equal(data.bars.length,60);assert.equal(data.provider,'Yahoo Finance');
 assert.equal(data.bars[0].open,.85);assert.match(data.delay,/delayed/);
 await markets.load('USDJPY','M5','yahoo');assert.equal(requested[1],'JPY=X');
 await markets.load('GC=F','M5','yahoo');assert.match((await markets.load('GC=F','M5','yahoo')).label,/futures/);
 await markets.load('CUSTOM.L','M5','yahoo');assert.equal(requested.at(-1),'CUSTOM.L');
 const calls=requested.length;
 for(const symbol of ['https://evil.example','../foo','..','']) await assert.rejects(markets.load(symbol,'M5','yahoo'),{status:400});
 assert.equal(requested.length,calls);
});

test('aggregates complete UTC four-hour Yahoo candles and excludes hourly gaps',async()=>{
 const hour=3600000, origin=Math.floor(start/(4*hour))*4*hour;
 const p=yahooPayload({count:81,step:hour,origin});
 // One missing hour must exclude its whole four-hour candle, not fabricate OHLC.
 for(const field of ['open','high','low','close'])p.chart.result[0].indicators.quote[0][field][2]=null;
 const markets=createMarketService({now:()=>origin+80*hour+1000,fetchImpl:async url=>{
  assert.equal(url.searchParams.get('interval'),'60m');return {ok:true,json:async()=>p};
 }});
 const data=await markets.load('EURGBP','H4','yahoo');
 assert.equal(data.bars.length,19);assert.equal(data.bars[0].time,origin+4*hour);
 assert.equal(data.bars.at(-1).time,origin+76*hour);assert.match(data.aggregation,/UTC/);
});

test('catalog outages preserve known pairs and finance choices; unavailable Yahoo data is an honest error',async()=>{
 const markets=createMarketService({fetchImpl:async()=>({ok:false,status:429})});
 const list=await markets.catalog();assert.equal(list.warnings.length,1);
 assert(list.pairs.some(p=>p.symbol==='BTCUSD'));assert(list.pairs.some(p=>p.symbol==='EURGBP=X'));
 await assert.rejects(markets.load('SOLUSD'),{status:502});
 const unavailable=createMarketService({fetchImpl:async()=>({ok:true,json:async()=>({chart:{error:{code:'Not Found'},result:null}})})});
 await assert.rejects(unavailable.load('UNKNOWN','M5','yahoo'),/no candles/);
});

test('does not treat the final delayed Yahoo quote as a completed candle',async()=>{
 const markets=createMarketService({now:()=>start+100*300000,fetchImpl:async()=>({ok:true,json:async()=>yahooPayload()})});
 const result=await markets.load('EURGBP','M5','yahoo');
 assert.equal(result.bars.length,60);
 assert.equal(result.bars.at(-1).time,start+59*300000);
});
