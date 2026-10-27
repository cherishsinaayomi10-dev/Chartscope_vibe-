import http from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {analyze,parseCSV,validateBars} from './analysis.mjs';
import {callVibe} from './vibe.mjs';
import {createMarketLoader} from './market.mjs';
const loadMarket = createMarketLoader();
const files={'/chatgpt-export.mjs':['chatgpt-export.mjs','text/javascript'],'/':['index.html','text/html'],'/workspace':['workspace.html','text/html'],'/app.js':['app.js','text/javascript'],'/app.css':['app.css','text/css'],'/vibe-ui.js':['vibe-ui.js','text/javascript'],'/mark.svg':['mark.svg','image/svg+xml']};
async function readJSON(req,limit){let size=0;const chunks=[];for await(const c of req){size+=c.length;if(size>limit)throw Error('Input is too large.');chunks.push(c)}return JSON.parse(Buffer.concat(chunks).toString())}
export function createServer({invokeVibe=callVibe,fetchMarket=loadMarket}={}){return http.createServer(async(req,res)=>{
 const json=(status,data)=>{if(res.destroyed)return;res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data))};
 try{
  const path=new URL(req.url,'http://local').pathname;
  // Browser requests must originate from this app, including when hosted publicly.
  if(req.method==='POST'&&req.headers.origin){let same=false;try{same=new URL(req.headers.origin).host===req.headers.host}catch{}if(!same)return json(403,{error:'Cross-site requests are not accepted.'})}
  if(path==='/api/health')return json(200,{ok:true});
  if(path==='/api/market/candles'&&req.method==='GET'){
   const params=new URL(req.url,'http://local').searchParams;
   try{return json(200,await fetchMarket(params.get('symbol')||'BTCUSD',params.get('timeframe')||'M5'))}
   catch(error){return json(error.status||502,{error:error.message||'Market data is unavailable.'})}
  }
  if(path==='/api/scan'&&req.method==='POST'){const input=await readJSON(req,1_500_000);const bars=input.csv!==undefined?parseCSV(input.csv):input.bars;return json(200,{...analyze(bars),bars})}
  if(path==='/api/vibe/status'&&req.method==='GET'){const data=await invokeVibe({action:'status'});return json(data.ok?200:data.error?.status||502,data)}
  const action={'/api/vibe/indicators':'indicators','/api/vibe/research':'research','/api/vibe/image':'image'}[path];
  if(action&&req.method==='POST'){
   // A publicly hosted AI connection must be explicitly enabled by the operator.
   const ai=action!=='indicators';const loopbacks=['127.0.0.1','::1','::ffff:127.0.0.1','localhost'];const remote=(process.env.HOST&&!loopbacks.includes(process.env.HOST))||!loopbacks.includes(req.socket.remoteAddress);
   if(ai&&(remote||process.env.API_AUTH_KEY)){const key=process.env.API_AUTH_KEY;if(!key)return json(403,{ok:false,error:{code:'REMOTE_AI_DISABLED',message:'The server operator must set an API_AUTH_KEY before enabling remote AI requests.'}});const received=Buffer.from(req.headers.authorization||''),expected=Buffer.from('Bearer '+key);if(received.length!==expected.length||!timingSafeEqual(received,expected))return json(401,{ok:false,error:{code:'ACCESS_KEY_REQUIRED',message:'Enter this ChartScope server’s access key in Connection setup.'}})}
   const body=await readJSON(req,action==='image'?11_000_000:1_500_000);
   const input={action,question:body.question,symbol:body.symbol,timeframe:body.timeframe,source:body.source};
   if(action==='image'){input.image=body.image;input.notes=body.notes;}else input.bars=validateBars(body.bars);
   if(body.question!==undefined&&(typeof body.question!=='string'||body.question.length>2000))throw Error('Use a question under 2,000 characters.');
   const controller=new AbortController();res.on('close',()=>{if(!res.writableEnded)controller.abort()});
   const data=await invokeVibe(input,{signal:controller.signal});return json(data.ok?200:data.error?.status||502,data)
  }
  if(path==='/favicon.ico'){res.writeHead(204);return res.end()}
  const entry=files[path];if(!entry)return json(404,{error:'Not found'});
  res.writeHead(200,{'Content-Type':entry[1]+'; charset=utf-8','X-Content-Type-Options':'nosniff'});res.end(await readFile(new URL(entry[0],import.meta.url)))
 }catch(e){json(400,{error:e.message||'Unable to process this request.'})}
})}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)createServer().listen(Number(process.env.PORT||4176),process.env.HOST||'127.0.0.1',()=>console.log('ChartScope with Vibe-Trading running on port '+(process.env.PORT||4176)));
