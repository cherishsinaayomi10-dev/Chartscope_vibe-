import json, os, shutil, subprocess, tempfile
from pathlib import Path

# Explicit fixtures: this check never contacts a market provider or AI account.
project = Path(__file__).resolve().parents[1]
artifacts = tempfile.TemporaryDirectory(prefix="chartscope-browser-")
from playwright.sync_api import sync_playwright
code = '''
import {createServer} from './server.mjs';
import {createMarketLoader} from './market.mjs';
const now=Date.now(), start=Math.floor(now/300000)*300000-180*300000;
const rows=Array.from({length:181},(_,i)=>[(start+i*300000)/1000,100+i,103+i,99+i,102+i]);
const fetchMarket=createMarketLoader({now:()=>now,fetchImpl:async()=>({ok:true,json:async()=>({error:[],result:{XXBTZUSD:rows,last:1}})})});
const server=createServer({fetchMarket,invokeVibe:async()=>({ok:true,result:{installed:true,version:'fixture',configured:false,detail:'Browser test'}})});
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
  assert not errors, errors
  page.screenshot(path=str(Path(artifacts.name)/'mobile.png'),full_page=True)
  browser.close()
 print('Mobile browser passed: market load, provenance, saved study, failed refresh, CSV round-trip, chart-switch race, and layout.')
finally:
 server.terminate();server.wait(timeout=10);artifacts.cleanup()
