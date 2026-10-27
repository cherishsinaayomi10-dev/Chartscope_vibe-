import json, os, shutil, subprocess, tempfile
from pathlib import Path

# Explicit fixtures: this check never contacts a market provider or AI account.
project = Path(__file__).resolve().parents[1]
artifacts = tempfile.TemporaryDirectory(prefix="chartscope-browser-")
from playwright.sync_api import sync_playwright
code = '''
import {createServer} from './server.mjs';
import {createMarketService} from './market.mjs';
const now=Date.now(), start=Math.floor(now/300000)*300000-180*300000;
const rows=Array.from({length:181},(_,i)=>[(start+i*300000)/1000,100+i,103+i,99+i,102+i]);
const markets=createMarketService({now:()=>now,fetchImpl:async url=>({ok:true,json:async()=>{
 if(url.pathname.endsWith('AssetPairs'))return {error:[],result:{SOLUSD:{altname:'SOLUSD',wsname:'SOL/USD',status:'online'},SOLEUR:{altname:'SOLEUR',wsname:'SOL/EUR',status:'online'},SOLUSDT:{altname:'SOLUSDT',wsname:'SOL/USDT',status:'online'},PENNYXBT:{altname:'PENNYXBT',wsname:'PENNY/XBT',status:'online'}}};
 if(url.hostname.includes('yahoo'))return {chart:{result:[{meta:{symbol:'EURGBP=X',currency:'GBP',instrumentType:'CURRENCY'},timestamp:rows.map((r,i)=>(Math.floor(now/(url.searchParams.get('interval')==='60m'?3600000:300000))*(url.searchParams.get('interval')==='60m'?3600000:300000)-(180-i)*(url.searchParams.get('interval')==='60m'?3600000:300000))/1000),indicators:{quote:[{open:rows.map(()=>.85),high:rows.map(()=>.87),low:rows.map(()=>.84),close:rows.map(()=>.86)}]}}],error:null}};
 return {error:[],result:{XXBTZUSD:url.searchParams.get('pair')==='PENNYXBT'?rows.map(r=>[r[0],.00000010,.00000012,.00000009,.00000011]):rows,last:1}};
}})});
const server=createServer({fetchMarket:markets.load,fetchMarkets:markets.catalog,invokeVibe:async()=>({ok:true,result:{installed:true,version:'fixture',configured:false,detail:'Browser test'}})});
server.listen(0,'127.0.0.1',()=>console.log(server.address().port));
'''
server=subprocess.Popen(['node','--input-type=module','-e',code],cwd=project,stdout=subprocess.PIPE,text=True)
try:
 port=int(server.stdout.readline().strip())
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=os.environ.get('CHARTSCOPE_CHROMIUM') or shutil.which('chromium') or None,headless=True,args=['--no-sandbox'])
  page=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=1)
  errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{port}/workspace')
  page.locator('#loadMarket').click()
  page.wait_for_function("document.querySelector('#scanState').textContent === 'Scan complete'")
  assert page.locator('#sourceBadge').inner_text()=='Kraken candles'
  assert 'Not streaming' in page.locator('#notice').inner_text()
  assert 'Kraken candles' in page.locator('#researchSource').inner_text()
  assert page.evaluate('window.chartScopeContext.bars.length')==180
  assert page.evaluate('window.chartScopeContext.source')=='market'
  page.locator('#save').click()
  history=page.evaluate("JSON.parse(localStorage.getItem('chartscope-history'))")
  assert history[0]['marketData']['provider']=='Kraken'
  assert history[0]['marketData']['fetchedAt']
  page.locator('#exportJSON').click()
  page.wait_for_function("document.querySelector('#marketPair').querySelector('option[value=\"kraken:SOLUSDT\"]') !== null")
  page.locator('#marketGroup').select_option('crypto')
  page.locator('#marketSearch').fill('SOL/USDT')
  assert page.locator('#marketPair option').count()==1
  page.locator('#loadMarket').click()
  page.wait_for_function("window.chartScopeContext.symbol === 'SOLUSDT' && document.querySelector('#scanState').textContent === 'Scan complete'")
  assert page.locator('#symbol').input_value()=='MARKET'
  page.locator('#marketSearch').fill('PENNY/BTC')
  page.locator('#loadMarket').click()
  page.wait_for_function("window.chartScopeContext.symbol === 'PENNYBTC' && document.querySelector('#scanState').textContent === 'Scan complete'")
  assert page.locator('#lastClose').inner_text()=='0.00000011'
  page.locator('#marketGroup').select_option('forex')
  page.locator('#marketSearch').fill('EUR/GBP')
  page.locator('#marketPair').select_option('yahoo:EURGBP=X')
  page.locator('#loadMarket').click()
  page.wait_for_function("window.chartScopeContext.symbol === 'EURGBP=X' && document.querySelector('#scanState').textContent === 'Scan complete'")
  assert page.locator('#sourceBadge').inner_text()=='Yahoo Finance candles'
  assert page.evaluate('window.chartScopeContext.bars[0].open')==.85
  assert 'May be delayed' in page.locator('#notice').inner_text()
  assert 'Yahoo Finance' in page.locator('#researchSource').inner_text()
  page.locator('[data-tf=H4]').click()
  page.wait_for_function("window.chartScopeContext.timeframe === 'H4' && document.querySelector('#scanState').textContent === 'Scan complete'")
  assert page.evaluate('window.chartScopeContext.source')=='market'
  page.locator('[data-tf=M5]').click()
  page.wait_for_function("window.chartScopeContext.timeframe === 'M5' && document.querySelector('#scanState').textContent === 'Scan complete'")
  page.locator('summary').filter(has_text='Enter another provider symbol').click()
  page.locator('#customSymbol').fill('GC=F')
  page.locator('#loadCustomMarket').click()
  page.wait_for_function("window.chartScopeContext.symbol === 'GC=F' && document.querySelector('#scanState').textContent === 'Scan complete'")
  assert 'Gold futures' in page.locator('#chartTitle').inner_text()
  assert page.evaluate('window.chartScopeContext.marketData.provider')=='Yahoo Finance'
  page.locator('#marketGroup').select_option('all')
  page.locator('#marketSearch').fill('BTC/USD')
  page.locator('#loadMarket').click()
  page.wait_for_function("window.chartScopeContext.symbol === 'BTCUSD' && document.querySelector('#scanState').textContent === 'Scan complete'")
  page.route('**/api/market/candles*',lambda route:route.fulfill(status=502,content_type='application/json',body=json.dumps({'error':'Provider unavailable (test)'})))
  page.locator('#loadMarket').click()
  page.wait_for_function("document.querySelector('#toast').textContent.includes('Provider unavailable')")
  assert page.locator('#sourceBadge').inner_text()=='Kraken candles'
  assert page.evaluate('window.chartScopeContext.bars.length')==180
  page.locator('#demoButton').click()
  assert page.locator('#sourceBadge').inner_text()=='Demo data'
  assert page.evaluate('window.chartScopeContext.marketData') is None
  assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'mobile page overflows'
  with page.expect_download() as dl:
   page.locator('#sampleCSV').click()
  path=str(Path(artifacts.name)/'candles.csv');dl.value.save_as(path)
  import csv
  with open(path) as f: records=list(csv.DictReader(f))
  assert len(records)==180 and set(records[0])=={'time','open','high','low','close'}
  page.locator('#csvFile').set_input_files(path)
  page.wait_for_function("document.querySelector('#scanState').textContent === 'Scan complete'")
  assert page.locator('#sourceBadge').inner_text()=='Imported OHLC'
  assert page.evaluate('window.chartScopeContext.bars.length')==180
  page.locator('#demoButton').click()
  def change_chart_during_scan(route):
   response=route.fetch()
   page.locator('#symbol').select_option('EURUSD')
   route.fulfill(response=response)
  page.route('**/api/scan',change_chart_during_scan)
  page.locator('#scan').click()
  page.wait_for_function("!document.querySelector('#scan').disabled")
  assert page.evaluate('window.chartScopeContext.symbol')=='EURUSD'
  assert page.evaluate('window.chartScopeContext.bars[0].open')<2, 'Previous BTC scan overwrote the new EUR chart'
  page.evaluate("()=>{navigator.clipboard.writeText=async text=>{window.testCopiedText=text}}")
  page.locator('#copyChatGPT').click()
  page.wait_for_function("document.querySelector('#chatGPTCopyStatus').textContent.startsWith('Copied.')")
  assert page.evaluate('window.testCopiedText')==page.locator('#chatGPTPrompt').input_value()
  assert 'EURUSD' in page.locator('#chatGPTPrompt').input_value()
  assert page.locator('#chatGPTDialog a').get_attribute('href')=='https://chatgpt.com/'
  page.locator('#chatGPTDialog [data-close]').click()
  page.evaluate("()=>{navigator.clipboard.writeText=async()=>{throw Error('Clipboard blocked by test')}}")
  page.locator('#copyChatGPT').click()
  page.wait_for_function("document.querySelector('#chatGPTCopyStatus').textContent.startsWith('Select the text')")
  assert 'Chart evidence:' in page.locator('#chatGPTPrompt').input_value()
  assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
  page.locator('#chatGPTDialog [data-close]').click()
  assert not errors, errors
  page.screenshot(path=str(Path(artifacts.name)/'mobile.png'),full_page=True)
  browser.close()
 print('Mobile browser passed: searchable multi-provider markets, tiny prices, forex, futures, timeframe changes, provenance, saved studies, CSV, request races, ChatGPT copy, and layout.')
finally:
 server.terminate();server.wait(timeout=10);artifacts.cleanup()
