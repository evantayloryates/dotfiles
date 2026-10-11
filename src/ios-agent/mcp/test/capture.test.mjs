import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {createRequire} from 'node:module';import {CaptureStore} from '../capture-store.mjs';
const create=createRequire(import.meta.url)('../../web/rich-capture.js');
function runtime(){return {console:{log:()=>17,warn:()=>19},fetch,Headers,TextDecoder,URL,setTimeout,clearTimeout,setInterval,clearInterval,btoa};}
test('capture is opt-in, scrubs only known secrets, preserves response identity/body and restores hooks',async()=>{
 const r=runtime(),original=r.fetch,log=r.console.log,c=create(r);let got=0;
 const object={visible:'fixture payload',authorization:'abcdefghijklmnop',password:'short'};Object.defineProperty(object,'getter',{enumerable:true,get(){got++;throw Error('must not read');}});
 assert.equal(c.status().active,false);assert.equal(r.console.log,log);
 c.start({id:'a'.repeat(32),modes:['console','network'],seconds:10});
 assert.equal(r.console.log(object),17);
 const response=await r.fetch('data:application/json,%7B%22answer%22%3A42%2C%22token%22%3A%22abcdefghijklmnop%22%7D');assert.equal((await response.json()).answer,42);
 await new Promise(resolve=>setTimeout(resolve,30));
 const batch=c.drain();assert(batch.events.length>=3);const text=JSON.stringify(batch);assert(!text.includes('abcdefghijklmnop'));assert(text.includes('abcd…mnop'));assert(text.includes('fixture payload'));assert.equal(got,0);
 await c.stop();assert.equal(r.fetch,original);assert.equal(r.console.log,log);assert.equal(c.status().active,false);
});
test('buffer rollover, deadline cleanup, stopped in-flight reads and owner discard are bounded',async()=>{
 const r=runtime();let now=0;const c=create(r,{now:()=>now});c.start({id:'b'.repeat(32),modes:['console'],seconds:10,maxBytes:32768});
 for(let i=0;i<100;i++)r.console.log('x'.repeat(1000));assert(c.status().dropped>0);assert(c.status().bufferedBytes<=32768);
 now=10001;r.console.log('expired');await c.stop(true);assert.equal(c.status().bufferedEvents,0);assert.equal(c.status().active,false);
 assert.throws(()=>c.start({id:'b'.repeat(32),modes:['audio'],seconds:10}),/audio_recorder_unavailable/);
});
test('audio chunks stay in private files; retention removes artifacts, not arbitrary directories',()=>{
 const state=fs.mkdtempSync(path.join(os.tmpdir(),'ios-capture-'));try{
 const store=new CaptureStore(state),id='c'.repeat(32);store.create(id,600);
 const saved=store.save(id,{events:[{kind:'audio',base64:Buffer.from('synthetic audio bytes').toString('base64'),mime:'audio/mp4'},{kind:'console',args:[{token:'abcdefghijklmnop',ordinary:'keep me'}]}]});
 const manifest=JSON.parse(fs.readFileSync(saved.file));assert.equal(manifest.events[0].base64,undefined);assert.equal(fs.readFileSync(path.join(path.dirname(saved.file),manifest.events[0].file),'utf8'),'synthetic audio bytes');assert.equal(fs.statSync(saved.file).mode&0o077,0);assert.equal(manifest.events[1].args[0].ordinary,'keep me');assert.equal(manifest.events[1].args[0].token,'abcd…mnop');
 store.prune(Date.now()+601000);assert(!fs.existsSync(saved.file));
 }finally{fs.rmSync(state,{recursive:true,force:true});}
});

test('native buffered blob capture uses actual size, preserves caller response and aborts on release',async()=>{
 const r=runtime();let reads=0,aborts=0,pending;
 r.FileReader=class{readAsText(blob){reads++;pending=this;if(blob.text!=='pending'){this.result=blob.text;queueMicrotask(()=>this.onload());}}abort(){aborts++;this.onabort?.();}};
 const response={headers:new Headers({'content-type':'application/json','content-length':'1'}),clone(){return {_bodyBlob:this.blob};},blob:{size:32,text:'{"answer":42,"token":"abcdefghijklmnop"}'}};
 r.fetch=async()=>response;const original=r.fetch,c=create(r);c.start({id:'d'.repeat(32),modes:['network'],seconds:10});
 assert.equal(await r.fetch('https://dev.test/fixture'),response);await new Promise(x=>setTimeout(x,0));
 let events=c.drain().events;const body=events.find(x=>x.bodyReader==='bounded-native-blob');assert.equal(body.body.answer,42);assert.equal(body.body.token,'abcd…mnop');assert.equal(reads,1);
 response.blob={size:32769,text:'not read'};await r.fetch('https://dev.test/oversize');await new Promise(x=>setTimeout(x,0));assert.equal(reads,1);assert(c.drain().events.some(x=>x.bodyUnavailable));
 response.blob={size:7,text:'pending'};await r.fetch('https://dev.test/pending');await c.stop(true);assert(aborts>=2);assert.equal(r.fetch,original);assert.equal(c.status().bufferedEvents,0);
 pending.result='late';pending.onload();await new Promise(x=>setTimeout(x,0));assert.equal(c.status().bufferedEvents,0);
});
