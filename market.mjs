import {validateBars} from './analysis.mjs';

const intervals = {M5: 5, M15: 15, H1: 60, H4: 240};
const seeds = [
  {symbol:'BTCUSD', providerSymbol:'XBTUSD', label:'BTC/USD', group:'crypto', feed:'kraken'},
  {symbol:'ETHUSD', providerSymbol:'ETHUSD', label:'ETH/USD', group:'crypto', feed:'kraken'},
];
const currencies = ['USD','EUR','GBP','JPY','CHF','CAD','AUD','NZD','ZAR','SGD','HKD','NOK','SEK','DKK','PLN','MXN','TRY','CNH','INR','BRL'];
const forex = currencies.flatMap(base => currencies.filter(quote => quote !== base).map(quote => ({symbol:base+quote+'=X',providerSymbol:(base==='USD'?quote:base+quote)+'=X',label:base+'/'+quote,group:'forex',feed:'yahoo'})));
const finance = [
  ...forex,
  ...[['^GSPC','S&P 500 index'],['^IXIC','Nasdaq Composite index'],['^NDX','Nasdaq 100 index'],['^DJI','Dow Jones index'],['^FTSE','FTSE 100 index'],['^GDAXI','DAX index'],['^N225','Nikkei 225 index']].map(([symbol,label])=>({symbol,label,group:'indices',feed:'yahoo'})),
  ...[['GC=F','Gold futures (not spot XAU/USD)'],['SI=F','Silver futures (not spot XAG/USD)'],['CL=F','WTI crude oil futures'],['BZ=F','Brent crude oil futures'],['NG=F','Natural gas futures']].map(([symbol,label])=>({symbol,label,group:'commodities',feed:'yahoo'})),
  ...['AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','SPY','QQQ'].map(symbol=>({symbol,label:symbol,group:'stocks',feed:'yahoo'})),
];
export class MarketError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}
function aggregate4h(bars) {
  const buckets = new Map(), hour = 3_600_000;
  for(const bar of bars) {
    const time = Math.floor(bar.time/(hour*4))*hour*4;
    if(!buckets.has(time)) buckets.set(time, []);
    buckets.get(time).push(bar);
  }
  return [...buckets.entries()].flatMap(([time,group]) => group.length===4 && group.every((bar,i)=>bar.time===time+i*hour)
    ? [{time,open:group[0].open,high:Math.max(...group.map(b=>b.high)),low:Math.min(...group.map(b=>b.low)),close:group[3].close}] : []);
}

export function createMarketService({fetchImpl = fetch, now = Date.now} = {}) {
  const cache = new Map(), pending = new Map();
  let catalogCache = null, catalogPending = null;
  async function read(url, provider) {
    try {
      const response = await fetchImpl(url, {signal:AbortSignal.timeout(10_000),redirect:'error',headers:{Accept:'application/json'}});
      if(!response.ok) throw new MarketError(response.status===429 ? `${provider} is rate-limiting requests. Try again later.` : `${provider} data is unavailable. Try again later or import a CSV.`);
      return await response.json();
    } catch(error) {
      if(error instanceof MarketError) throw error;
      throw new MarketError(`Unable to contact ${provider}. Try again later or import a CSV.`);
    }
  }
  async function catalog() {
    if(catalogCache && now()-catalogCache.at<3_600_000) return catalogCache.data;
    if(catalogPending) return catalogPending;
    catalogPending=(async()=>{
      const pairs = new Map(seeds.map(p=>[p.symbol,p]));
      const warnings=[];
      try {
        const payload = await read(new URL('https://api.kraken.com/0/public/AssetPairs'),'Kraken');
        if(!Array.isArray(payload.error)||payload.error.length||!payload.result||Array.isArray(payload.result)) throw new MarketError('Kraken returned an invalid market list.');
        for(const [id,pair] of Object.entries(payload.result)) {
          if(!pair || typeof pair.wsname!=='string' || typeof pair.altname!=='string' || id.endsWith('.d') || (pair.status && pair.status!=='online')) continue;
          const [base,quote,...extra]=pair.wsname.split('/').map(s=>s==='XBT'?'BTC':s==='XDG'?'DOGE':s);
          if(!base||!quote||extra.length||!/^[A-Z0-9.]+$/.test(base+quote)||!/^[A-Za-z0-9.]+$/.test(pair.altname)) continue;
          const symbol = base+quote;
          pairs.set(symbol,{symbol,providerSymbol:pair.altname,label:base+'/'+quote,group:currencies.includes(base)&&currencies.includes(quote)?'forex':'crypto',feed:'kraken'});
        }
      } catch(error) { warnings.push(error.message); }
      const data={pairs:[...pairs.values(),...finance],warnings};
      // Retry a failed discovery soon; successful catalogs refresh hourly.
      catalogCache={at:now()-(warnings.length?3_600_000-30_000:0),data};
      return data;
    })();
    try{return await catalogPending}finally{catalogPending=null}
  }
  async function load(symbol='BTCUSD', timeframe='M5', feed='kraken') {
    if(!Object.hasOwn(intervals,timeframe)||!['kraken','yahoo'].includes(feed)) throw new MarketError('Choose a supported provider and M5, M15, H1, or H4.',400);
    if(typeof symbol!=='string'||symbol.length>40||!symbol||!/^[A-Za-z0-9^=./-]+$/.test(symbol)) throw new MarketError('Enter a valid market symbol.',400);
    symbol=symbol.toUpperCase();
    let market;
    if(feed==='kraken') {
      symbol=symbol.replaceAll('/','').replace(/^XBT/,'BTC').replace(/^XDG/,'DOGE');
      market = seeds.find(p=>p.symbol===symbol);
      if(!market) {
        const list = await catalog();
        market=list.pairs.find(p=>p.feed==='kraken'&&(p.symbol===symbol||p.providerSymbol===symbol));
        if(!market) throw new MarketError(list.warnings.length?'The Kraken pair list is unavailable. Retry the pair list or import a CSV.':'This pair is not in Kraken’s available market list.',list.warnings.length?502:400);
        symbol=market.symbol;
      }
    } else {
      symbol=symbol.replaceAll('/','');
      if(/^[A-Z]{6}$/.test(symbol)&&(currencies.includes(symbol.slice(0,3))||currencies.includes(symbol.slice(3)))) symbol+='=X';
      if(!/^[A-Z0-9^][A-Z0-9^=.-]{0,39}$/.test(symbol)||symbol.includes('..'))throw new MarketError('Enter a valid provider symbol.',400);
      market=finance.find(p=>p.symbol===symbol)||{symbol,providerSymbol:/^USD[A-Z]{3}=X$/.test(symbol)?symbol.slice(3):symbol,label:symbol,feed:'yahoo',group:'other'};
    }
    const key = `${feed}/${symbol}/${timeframe}`, saved=cache.get(key);
    if(saved&&now()-saved.at<60_000)return saved.data;
    if(pending.has(key))return pending.get(key);
    if(pending.size>=4)throw new MarketError('Market requests are busy. Try again shortly.',503);
    const request=(async()=>{
      try {
        let raw, metadata={};
        if(feed==='kraken') {
          const url=new URL('https://api.kraken.com/0/public/OHLC');
          url.searchParams.set('pair',market.providerSymbol);url.searchParams.set('interval',intervals[timeframe]);
          const payload=await read(url,'Kraken');
          if(!Array.isArray(payload.error)||payload.error.length||!payload.result)throw new MarketError('Kraken could not return candles for this market.');
          const rows=Object.entries(payload.result).find(([name])=>name!=='last')?.[1];
          if(!Array.isArray(rows)||rows.length>1000)throw new MarketError('Kraken returned invalid candles.');
          raw=rows.slice(0,-1).map(row=>{
            if(!Array.isArray(row)||row.length<5)throw new MarketError('Kraken returned invalid candles.');
            return {time:Number(row[0])*1000,open:Number(row[1]),high:Number(row[2]),low:Number(row[3]),close:Number(row[4])};
          });
          metadata={venue:'Kraken',delay:'Exchange snapshot; not streaming.'};
        } else {
          const url=new URL('https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(market.providerSymbol||symbol));
          url.searchParams.set('interval',{M5:'5m',M15:'15m',H1:'60m',H4:'60m'}[timeframe]);
          url.searchParams.set('range',timeframe==='M5'||timeframe==='M15'?'5d':'1mo');
          const payload=await read(url,'Yahoo Finance'), item=payload?.chart?.result?.[0];
          if(payload?.chart?.error||!item)throw new MarketError('Yahoo Finance has no candles for this symbol/timeframe. Try another symbol, timeframe, or CSV.');
          const times=item.timestamp, values=item.indicators?.quote?.[0];
          if(!Array.isArray(times)||times.length>10000||!values||!['open','high','low','close'].every(k=>Array.isArray(values[k])&&values[k].length===times.length))throw new MarketError('Yahoo Finance returned invalid candles.');
          // The last quote can still be forming even when the feed is delayed.
          raw=times.slice(0,-1).flatMap((time,i)=>[time,...['open','high','low','close'].map(k=>values[k][i])].some(v=>v===null||v===undefined)?[]:[{time:Number(time)*1000,open:Number(values.open[i]),high:Number(values.high[i]),low:Number(values.low[i]),close:Number(values.close[i])}]);
          const meta=item.meta||{};
          metadata={venue:typeof meta.exchangeName==='string'?meta.exchangeName:null,currency:typeof meta.currency==='string'?meta.currency:null,instrumentType:typeof meta.instrumentType==='string'?meta.instrumentType:null,delay:'May be delayed; not streaming. Availability varies by symbol.',aggregation:timeframe==='H4'?'Four consecutive hourly candles aligned to UTC four-hour boundaries.':null};
        }
        const duration=intervals[timeframe]*60_000, baseDuration=feed==='yahoo'&&timeframe==='H4'?3_600_000:duration;
        raw=validateBars(raw.filter(b=>b.time+baseDuration<=now()).slice(-2000));
        if(feed==='yahoo'&&timeframe==='H4')raw=aggregate4h(raw);
        const bars=validateBars(raw.slice(-180));
        const data={bars,symbol,timeframe,source:'market',provider:feed==='kraken'?'Kraken':'Yahoo Finance',feed,providerSymbol:market.providerSymbol||symbol,label:market.label,group:market.group,...metadata,fetchedAt:new Date(now()).toISOString(),lastClosedAt:new Date(bars.at(-1).time+duration).toISOString()};
        cache.delete(key);cache.set(key,{at:now(),data});
        if(cache.size>128)cache.delete(cache.keys().next().value);
        return data;
      } catch(error) {
        if(error instanceof MarketError)throw error;
        throw new MarketError('Not enough valid closed candles for this market/timeframe. Try another timeframe or import a CSV.');
      }
    })();
    pending.set(key,request);try{return await request}finally{pending.delete(key)}
  }
  return {load,catalog};
}
export function createMarketLoader(options) { return createMarketService(options).load; }
