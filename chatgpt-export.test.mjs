import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildChatGPTPrompt} from './chatgpt-export.mjs';
const bars=Array.from({length:180},(_,time)=>({time,open:10,high:12,low:9,close:11}));
test('exports bounded chart evidence with provenance, never account secrets',()=>{
 const prompt=buildChatGPTPrompt({source:'market',symbol:'BTCUSD',timeframe:'M5',bars,marketData:{provider:'Kraken',fetchedAt:'2026-10-27',secret:'hidden'},accessKey:'private-access'},'Explain trend',{rsi14:50,engine:'Vibe-Trading',api_key:'private-provider'});
 const data=JSON.parse(prompt.split('Chart evidence:\n')[1]);
 assert.equal(data.latestCandles.length,120);assert.equal(data.latestCandles[0].time,60);
 assert.equal(data.totalCandles,180);assert.equal(data.market.provider,'Kraken');
 assert.equal(data.indicators.rsi14,50);assert(!prompt.includes('private-access'));assert(!prompt.includes('private-provider'));assert(!prompt.includes('hidden'));
 assert.match(prompt,/not a streaming feed/);
});
test('image exports require the original image and omit binary data and old candles',()=>{
 const prompt=buildChatGPTPrompt({source:'image',bars,image:'data:image/png;base64,private-image',notes:[{x:.5,y:.2,text:'Level'}]});
 const data=JSON.parse(prompt.split('Chart evidence:\n')[1]);
 assert.match(prompt,/attach the original chart image separately/);assert(!prompt.includes('private-image'));
 assert.equal(data.latestCandles,undefined);assert.equal(data.manualNotes[0].text,'Level');
 assert.match(buildChatGPTPrompt({source:'demo',bars}),/Demo candles are generated/);
});
