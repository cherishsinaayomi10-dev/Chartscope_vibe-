import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
const localPython=process.platform==='win32'?root+'.venv-vibe/Scripts/python.exe':root+'.venv-vibe/bin/python';
export const python=process.env.CHARTSCOPE_VIBE_PYTHON||(existsSync(localPython)?localPython:existsSync('/workspace/toolchains/vibe-trading-venv/bin/python')?'/workspace/toolchains/vibe-trading-venv/bin/python':process.platform==='win32'?'python':'python3');
export const vibeEnv={...process.env,VIBE_TRADING_HOME:process.env.VIBE_TRADING_HOME||root+'.runtime/vibe',PYTHONDONTWRITEBYTECODE:'1',MPLCONFIGDIR:process.env.MPLCONFIGDIR||root+'.runtime/matplotlib'};
export async function callVibe(input,{signal}={}){
 return new Promise(resolve=>{
  const child=spawn(python,[root+'vibe_bridge.py'],{cwd:root,env:vibeEnv,stdio:['pipe','pipe','ignore']});let output='',finished=false,timer;
  const done=value=>{if(finished)return;finished=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);resolve(value)};
  const error=(code,message,status)=>({ok:false,error:{code,message,status}});
  const abort=()=>{child.kill('SIGTERM');done(error('CANCELLED','The research request was cancelled.',499))};
  timer=setTimeout(()=>{child.kill('SIGKILL');done(error('VIBE_TIMEOUT','The research request timed out. Check provider connectivity before trying again.',504))},input.action==='status'?15000:150000);
  if(signal?.aborted){abort();return}signal?.addEventListener('abort',abort,{once:true});
  child.on('error',()=>done(error('VIBE_NOT_INSTALLED','Vibe-Trading is not installed on this server. See Connection setup.',503)));
  child.stdin.on('error',()=>{});
  child.stdout.on('data',chunk=>{output+=chunk;if(output.length>1_500_000){child.kill('SIGKILL');done(error('VIBE_OUTPUT_LIMIT','The model response was too large.',502))}});
  child.on('close',()=>{if(finished)return;try{const data=JSON.parse(output);if(typeof data.ok!=='boolean')throw Error();done(data)}catch{done(error('VIBE_ERROR','The research engine returned an unreadable response.',502))}});
  child.stdin.end(JSON.stringify(input));
 });
}
