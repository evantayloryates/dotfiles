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

test('failed audio recorder construction stops only its clone and does not retry each scan',async()=>{
 const r=runtime();let scans,clones=0,cloneStops=0,sourceStops=0,attempts=0;
 r.setInterval=fn=>{scans=fn;return 1;};r.clearInterval=()=>{};
 r.MediaStream=class{constructor(tracks){this.tracks=tracks;}};
 r.MediaRecorder=class{static isTypeSupported(){return true;}constructor(){attempts++;throw Error('synthetic unsupported track');}};
 const source={kind:'audio',readyState:'live',stop(){sourceStops++;},clone(){clones++;return {stop(){cloneStops++;}};}};
 const c=create(r,{sources:()=>[source]});
 try{
  c.start({id:'e'.repeat(32),modes:['audio'],seconds:10});scans();scans();
  assert.equal(clones,1);assert.equal(attempts,1);assert.equal(cloneStops,1);assert.equal(sourceStops,0);
  assert.equal(c.drain().events.filter(x=>x.reason==='recorder_or_track_clone_unavailable').length,1);
 }finally{await c.stop(true);}
 assert.equal(sourceStops,0);assert.equal(cloneStops,1);
});

test('partially started recorder is stopped on failure; a new capture may try that source once again',async()=>{
 const r=runtime();let cloneStops=0,recorderStops=0,attempts=0,sourceStops=0;
 r.setInterval=()=>1;r.clearInterval=()=>{};r.MediaStream=class{};
 r.MediaRecorder=class{
  static isTypeSupported(){return true;}
  constructor(){attempts++;this.state='inactive';}
  start(){this.state='recording';throw Error('synthetic start failure');}
  stop(){recorderStops++;assert.equal(this.ondataavailable,null);this.state='inactive';}
 };
 const source={kind:'audio',readyState:'live',stop(){sourceStops++;},clone(){return {stop(){cloneStops++;}};}};
 const c=create(r,{sources:()=>[source]});
 for(let i=0;i<2;i++){c.start({id:String(i+1).repeat(32),modes:['audio'],seconds:10});await c.stop(true);}
 assert.equal(attempts,2);assert.equal(cloneStops,2);assert.equal(recorderStops,2);assert.equal(sourceStops,0);
});

test('audio provenance and stable references survive an earlier failed recorder; originals are preserved',async()=>{
 const r=runtime(),made=[];let cloneStops=0,sourceStops=0;
 r.MediaStream=class{constructor(tracks){this.tracks=tracks;}};
 r.MediaRecorder=class{
  static isTypeSupported(){return true;}
  constructor(stream){if(stream.tracks[0].fail)throw Error('synthetic failure');this.state='inactive';made.push(this);}
  start(){this.state='recording';}addEventListener(type,fn){if(type==='stop')this.onstop=fn;}
  stop(){this.state='inactive';this.onstop?.();}
 };
 const track=fail=>({kind:'audio',readyState:'live',stop(){sourceStops++;},clone(){return {fail,stop(){cloneStops++;}};}});
 const failed=track(true),received=track(false),c=create(r,{sources:()=>[failed,received],sourceKinds:t=>t===received?['rtc-receiver','dom-media','private-track-label']:['get-user-media']});
 try{
  c.start({id:'9'.repeat(32),modes:['audio'],seconds:10});
  const coverage=c.status().coverage;
  assert.deepEqual(coverage.audioSources,[{trackRef:1,origins:['get-user-media'],recorder:'unavailable'},{trackRef:2,origins:['rtc-receiver','dom-media'],recorder:'started'}]);
  made[0].ondataavailable({data:new Blob(['synthetic chunk'],{type:'audio/mp4'})});
  await new Promise(resolve=>setImmediate(resolve));
  const batch=c.drain();assert.equal(batch.events.find(x=>x.base64).trackRef,2);assert(!JSON.stringify(batch).includes('private-track-label'));
  await c.stop();assert.equal(cloneStops,2);assert.equal(sourceStops,0);
  assert.deepEqual(c.status().coverage.audioSources,coverage.audioSources);
 }finally{await c.stop(true);}
});

test('audio discovery bounds recorder attempts across the entire capture',async()=>{
 const r=runtime();let scan,attempts=0;
 r.setInterval=fn=>{scan=fn;return 1;};r.clearInterval=()=>{};r.MediaStream=class{};
 r.MediaRecorder=class{static isTypeSupported(){return true;}constructor(){attempts++;throw Error('unavailable');}};
 const sources=Array.from({length:33},()=>({kind:'audio',readyState:'live',clone(){return {stop(){}};}}));
 let first=true;const c=create(r,{sources:()=>first?sources.slice(0,32):sources.slice(1)});
 try{c.start({id:'8'.repeat(32),modes:['audio'],seconds:10});first=false;scan();assert.equal(attempts,32);assert.equal(c.status().coverage.audioSources.length,32);assert.equal(c.status().coverage.audioSourceLimitReached,true);}finally{await c.stop(true);}
});

test('stable discovery reports omitted live audio beyond the recorder limit',async()=>{
 const r=runtime();let attempts=0;
 r.setInterval=()=>1;r.clearInterval=()=>{};r.MediaStream=class{};
 r.MediaRecorder=class{static isTypeSupported(){return true;}constructor(){attempts++;throw Error('unavailable');}};
 const tracks=Array.from({length:33},()=>({kind:'audio',readyState:'live',clone(){return {stop(){}};}}));
 for(const count of [32,33]){
  const c=create(r,{sources:()=>tracks.slice(0,count)});
  try{c.start({id:'7'.repeat(32),modes:['audio'],seconds:10});assert.equal(c.status().coverage.audioSourceLimitReached,count===33);assert.equal(c.status().coverage.audioSources.length,32);}finally{await c.stop(true);}
 }
 assert.equal(attempts,64);
});

test('on-demand capture sees an already-open real WebSocket without closing it',async()=>{
 const {createServer}=await import('node:http'),{createHash}=await import('node:crypto');
 const server=createServer();
 const peerReady=new Promise(resolve=>server.once('upgrade',(request,socket)=>{
  const accept=createHash('sha1').update(request.headers['sec-websocket-key']+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');resolve(socket);
 }));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const ws=new WebSocket(`ws://127.0.0.1:${server.address().port}`);
 await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 const peer=await peerReady,r={...runtime(),WebSocket},c=create(r,{socketSources:()=>[ws]});
 const receive=body=>new Promise(resolve=>{const bytes=Buffer.from(body);assert(bytes.length<126);ws.addEventListener('message',e=>resolve(e.data),{once:true});peer.write(Buffer.concat([Buffer.from([0x81,bytes.length]),bytes]));});
 try{
  c.start({id:'f'.repeat(32),modes:['network'],seconds:10});
  assert.deepEqual(c.status().coverage.sockets,{existingDiscoveryAvailable:true,discoveryFailed:false,existingWatched:1,newWatched:0,listenersActive:1});
  assert.equal(await receive('existing-socket token=abcdefghijklmnop'),'existing-socket token=abcdefghijklmnop');
  const captured=c.drain().events.filter(e=>e.phase==='ws-receive');
  assert.equal(captured.length,1);assert.equal(captured[0].body,'existing-socket token=abcd…mnop');
  await c.stop();assert.equal(c.status().coverage.sockets.listenersActive,0);assert.equal(ws.readyState,WebSocket.OPEN);
  assert.equal(await receive('after-stop'),'after-stop');assert.equal(c.drain().events.length,0);
 }finally{await c.stop(true);ws.close();peer.destroy();await new Promise(resolve=>server.close(resolve));}
});

test('existing socket discovery is bounded and receive listeners detach on every stop',async()=>{
 const r=runtime(),listeners=new Map();let adds=0,removes=0,closed=0;
 const sockets=Array.from({length:40},()=>({url:'wss://dev.test/socket',addEventListener(type,fn){adds++;listeners.set(this,fn);},removeEventListener(type,fn){assert.equal(listeners.get(this),fn);removes++;listeners.delete(this);},close(){closed++;}}));
 const c=create(r,{socketSources:()=>sockets});
 for(let i=0;i<2;i++){
  c.start({id:String(i+1).repeat(32),modes:['network'],seconds:10});assert.equal(listeners.size,32);
  listeners.get(sockets[0])({data:'retained payload'});assert.equal(c.drain().events.filter(e=>e.phase==='ws-receive').length,1);
  await c.stop();assert.equal(listeners.size,0);
 }
 assert.equal(adds,64);assert.equal(removes,64);assert.equal(closed,0);
 const unavailable=create(r,{socketSources:()=>{throw Error('synthetic unavailable');}});
 unavailable.start({id:'a'.repeat(32),modes:['network'],seconds:10});assert.equal(unavailable.status().coverage.sockets.discoveryFailed,true);await unavailable.stop();
});
