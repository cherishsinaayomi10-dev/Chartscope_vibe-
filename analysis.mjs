export function validateBars(bars){if(!Array.isArray(bars)||bars.length<10||bars.length>2000)throw Error('Provide 10 to 2,000 candles.');let prev=-Infinity;return bars.map((b,i)=>{const time=typeof b.time==='number'?b.time:Date.parse(b.time);const open=Number(b.open),high=Number(b.high),low=Number(b.low),close=Number(b.close);if(![time,open,high,low,close].every(Number.isFinite)||time<=prev||low>Math.min(open,close)||high<Math.max(open,close)||low>high||low<=0)throw Error(`Invalid candle ${i+1}. Use positive OHLC prices, valid ranges, and increasing timestamps.`);prev=time;return{time,open,high,low,close}})}
export function analyze(input){const bars=validateBars(input);const signals=[];let sh=null,sl=null;const brokenHigh=new Set(),brokenLow=new Set();const add=(type,side,i,level,extra={})=>signals.push({type,side,index:i,time:bars[i].time,level,...extra});for(let i=2;i<bars.length;i++){
 // A pivot becomes available only after its two right-hand candles have closed.
 const j=i-2;if(j>=2){const p=bars[j],ne=[bars[j-2],bars[j-1],bars[j+1],bars[j+2]];if(ne.every(b=>p.high>b.high))sh={index:j,level:p.high};if(ne.every(b=>p.low<b.low))sl={index:j,level:p.low}}
 const b=bars[i],prior=bars[i-1];
 if(b.low>bars[i-2].high)add('fvg','bullish',i,bars[i-2].high,{upper:b.low,lower:bars[i-2].high});
 if(b.high<bars[i-2].low)add('fvg','bearish',i,b.high,{upper:bars[i-2].low,lower:b.high});
 for(const [pivot,side,broken] of [[sh,'bullish',brokenHigh],[sl,'bearish',brokenLow]]){if(!pivot)continue;const level=pivot.level;const crossed=side==='bullish'?b.close>level&&prior.close<=level:b.close<level&&prior.close>=level;
  if(crossed&&!broken.has(pivot.index)){broken.add(pivot.index);add('bos',side,i,level,{pivotIndex:pivot.index});
   for(let k=i-1;k>=Math.max(0,i-8);k--){const c=bars[k];if(side==='bullish'?c.close<c.open:c.close>c.open){add('orderblock',side,i,c.low,{lower:c.low,upper:c.high,sourceIndex:k});break}}
  }
 }
 if(sh&&!brokenHigh.has(sh.index)&&b.high>sh.level&&b.close<sh.level)add('sweep','bearish',i,sh.level);
 if(sl&&!brokenLow.has(sl.index)&&b.low<sl.level&&b.close>sl.level)add('sweep','bullish',i,sl.level);
 }
 const mean=bars.slice(-20).reduce((a,b)=>a+b.close,0)/Math.min(20,bars.length),last=bars.at(-1).close;
 return{signals,barCount:bars.length,firstTime:bars[0].time,lastTime:bars.at(-1).time,lastClose:last,mean20:mean,position:last>=mean?'Above average':'Below average',method:'Deterministic OHLC rules; not AI or a price forecast.'};}
export function parseCSV(text){const lines=text.trim().split(/\r?\n/).filter(l=>l.trim());const header=lines.shift().split(',').map(s=>s.trim().toLowerCase().replace(/^"|"$/g,''));const keys=['time','open','high','low','close'];if(!keys.every(k=>header.includes(k)))throw Error('CSV headers must include time,open,high,low,close.');return validateBars(lines.map(l=>{const v=l.split(',').map(x=>x.trim().replace(/^"|"$/g,''));if(v.length!==header.length)throw Error('Each CSV row must have the same number of columns as the header.');const obj=Object.fromEntries(keys.map(k=>[k,v[header.indexOf(k)]]));if(/^\d+$/.test(obj.time))obj.time=Number(obj.time)*(obj.time.length<=10?1000:1);return obj}));}
