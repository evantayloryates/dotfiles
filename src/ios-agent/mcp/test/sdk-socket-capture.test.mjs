import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createServer} from 'node:http';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';

const captureFactory=createRequire(import.meta.url)('../../web/rich-capture.js');
test('exact page SDK discovers its existing socket for on-demand capture; closed sockets retire',async()=>{
 const server=createServer();
 const connected=new Promise(resolve=>server.once('upgrade',(request,socket)=>{
  const accept=createHash('sha1').update(request.headers['sec-websocket-key']+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');resolve(socket);
 }));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const storage=new Map([['ios-agent-page',JSON.stringify({page:'synthetic-page',token:'synthetic-token'})]]);
 const storageAPI={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 const quiet=()=>{},Element=class{attachShadow(){return {};}};
 const XMLHttpRequest=class{open(){}send(){}};
 let capture,options,peer,ws;
 const context=vm.createContext({console:{log:quiet,warn:quiet,error:quiet,info:quiet,debug:quiet},
  WebSocket,Headers,TextDecoder,URL,URLSearchParams,XMLHttpRequest,Element,Blob,performance,crypto:{randomUUID},
  navigator:{userAgent:'synthetic SDK wiring test',sendBeacon:quiet},sessionStorage:storageAPI,localStorage:storageAPI,
  location:{hash:'',pathname:'/dev-fixture',search:''},history:{replaceState:quiet},
  document:{hidden:false,readyState:'complete',documentElement:{append:quiet},createElement:()=>({dataset:{},style:{},setAttribute:quiet,remove:quiet}),querySelectorAll:()=>[]},
  fetch:async()=>({ok:true,status:200,json:async()=>({lease:null,epoch:'synthetic'})}),
  addEventListener:quiet,removeEventListener:quiet,
  setTimeout:(fn,ms)=>{const t=setTimeout(fn,ms);t.unref();return t;},clearTimeout,
  setInterval:(fn,ms)=>{const t=setInterval(fn,ms);t.unref();return t;},clearInterval,btoa,
  __iosCreateCapture:(runtime,opts)=>{options=opts;capture=captureFactory(runtime,opts);return capture;}});
 context.window=context;
 try{
  vm.runInContext(fs.readFileSync(new URL('../../web/sdk.js',import.meta.url),'utf8'),context);
  await new Promise(resolve=>setImmediate(resolve)); // Finish the initial no-lease poll.
  ws=vm.runInContext(`new WebSocket('ws://127.0.0.1:${server.address().port}')`,context);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});peer=await connected;
  assert.equal(options.socketSources().length,1);assert.equal(options.socketSources()[0],ws);
  capture.start({id:'a'.repeat(32),modes:['network'],seconds:10});
  assert.equal(capture.status().coverage.sockets.existingWatched,1);
  const received=new Promise(resolve=>ws.addEventListener('message',resolve,{once:true}));
  const bytes=Buffer.from('SDK existing socket');peer.write(Buffer.concat([Buffer.from([0x81,bytes.length]),bytes]));await received;
  const events=capture.drain().events.filter(e=>e.phase==='ws-receive');assert.equal(events.length,1);assert.equal(events[0].body,'SDK existing socket');
  await capture.stop();assert.equal(ws.readyState,WebSocket.OPEN);
  const closed=new Promise(resolve=>ws.addEventListener('close',resolve,{once:true}));peer.destroy();await closed;
  assert.equal(options.socketSources().length,0);
 }finally{try{await capture?.stop(true);context.__iosWebAgent?.stop();}finally{ws?.close();peer?.destroy();await new Promise(resolve=>server.close(resolve));}}
});
