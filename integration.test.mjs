import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from './server.mjs';
import {callVibe} from './vibe.mjs';
const bars=Array.from({length:60},(_,i)=>({time:1700000000000+i*300000,open:100+i-.2,high:101+i,low:99+i,close:100+i}));
async function serverRun(options,run){const server=createServer(options);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));try{await run('http://127.0.0.1:'+server.address().port)}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}}

test('real Vibe-Trading math computes supplied bars with provenance, without an AI key',async()=>{
 const data=await callVibe({action:'indicators',bars});assert.equal(data.ok,true,JSON.stringify(data.error));const r=data.result;assert.equal(r.engine,'Vibe-Trading');assert.equal(r.version,'0.1.18');assert.equal(r.bar_count,60);assert.equal(r.sma20,149.5);assert.equal(r.sma50,134.5);assert.equal(r.rsi14,100);assert(r.macd.histogram>0);assert(r.bollinger.upper>r.bollinger.middle);assert.match(r.fingerprint,/^[a-f0-9]{64}$/);assert.equal(r.last_time,bars.at(-1).time);
 const invalid=await callVibe({action:'indicators',bars:bars.map((b,i)=>i===4?{...b,high:1}:b)});assert.equal(invalid.error.code,'BAD_INPUT');
});
test('real bridge reports missing AI configuration honestly and disallows unknown actions',async()=>{
 const status=await callVibe({action:'status'});assert.equal(status.ok,true);assert.equal(status.result.trading_enabled,false);assert.equal(status.result.verified,false);if(!status.result.configured){const result=await callVibe({action:'research',bars});assert.equal(result.ok,false);assert.equal(result.error.code,'AI_NOT_CONFIGURED')}
 const result=await callVibe({action:'broker_order'});assert.equal(result.ok,false);assert.equal(result.error.code,'BAD_INPUT');
});
test('HTTP adapter forwards only known research inputs and propagates honest provider failures',async()=>{
 const calls=[];const invokeVibe=async input=>{calls.push(input);return input.action==='status'?{ok:true,result:{installed:true}}:input.question==='fail'?{ok:false,error:{code:'AI_REQUEST_FAILED',message:'Provider failed',status:502}}:{ok:true,result:{answer:'Test-provider response',engine:'test fixture'}}};
 await serverRun({invokeVibe},async base=>{
  const status=await(await fetch(base+'/api/vibe/status')).json();assert(status.result.installed);
  const post=(path,body,headers={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  let r=await post('/api/vibe/research',{bars,question:'Explain trend',action:'broker_order',tools:['bash']});assert.equal(r.status,200);assert.equal(calls.at(-1).action,'research');assert.equal(calls.at(-1).tools,undefined);assert.equal((await r.json()).result.answer,'Test-provider response');
  r=await post('/api/vibe/research',{bars,question:'fail'});assert.equal(r.status,502);assert.equal((await r.json()).error.code,'AI_REQUEST_FAILED');
  assert.equal((await post('/api/vibe/indicators',{bars:[]})).status,400);
  assert.equal((await post('/api/vibe/research',{bars},{Origin:'https://other.invalid'})).status,403);
  assert.equal((await fetch(base+'/api/vibe/broker_order')).status,404);
  assert.equal((await fetch(base+'/vibe_bridge.py')).status,404);
 });
});

test('remote AI is closed by default and accepts only the configured app-access key',async()=>{
 const savedHost=process.env.HOST,savedKey=process.env.API_AUTH_KEY;let invoked=0;
 try{process.env.HOST='0.0.0.0';delete process.env.API_AUTH_KEY;
 await serverRun({invokeVibe:async()=>{invoked++;return{ok:true,result:{answer:'Authorized fixture'}}}},async base=>{
  const post=key=>fetch(base+'/api/vibe/research',{method:'POST',headers:{'Content-Type':'application/json',...(key?{Authorization:'Bearer '+key}:{})},body:JSON.stringify({bars})});
  assert.equal((await post()).status,403);assert.equal(invoked,0);
  process.env.API_AUTH_KEY='fixture-server-access';assert.equal((await post()).status,401);assert.equal((await post('incorrect-fixture-key')).status,401);assert.equal(invoked,0);
  const res=await post('fixture-server-access');assert.equal(res.status,200);assert.equal(invoked,1);
 });
 }finally{if(savedHost===undefined)delete process.env.HOST;else process.env.HOST=savedHost;if(savedKey===undefined)delete process.env.API_AUTH_KEY;else process.env.API_AUTH_KEY=savedKey}
});
