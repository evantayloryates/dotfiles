import test from 'node:test';import assert from 'node:assert/strict';import {Client} from '@modelcontextprotocol/sdk/client/index.js';import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';import {createServer} from '../server.mjs';
test('worker source, console and sampling schemas require fresh worker references and reject cross-operation arguments',async()=>{
 const seen=[];const {server}=createServer({deviceInspect:async x=>{seen.push(x);return {ok:true};},cancel:async()=>{},close:async()=>{}});const [ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);const c=new Client({name:'worker-schema',version:'1'});await c.connect(ct);
 try{
  const base={browser:'safari',documentRef:'a'.repeat(32),workerId:'worker:1'};
  for(const op of ['worker-sources','worker-source','worker-console','worker-profile']){
   for(const missing of ['workerId','documentRef']){const q={...base,op};delete q[missing];assert((await c.callTool({name:'ios_browser_debug',arguments:q})).isError);}
  }
  for(const q of [{...base,op:'worker-source'},{...base,op:'worker-console',expression:'42'},{...base,op:'sources'},{...base,op:'worker-sources',scriptId:'1'},{...base,op:'worker-console',sampleMs:3001}])assert((await c.callTool({name:'ios_browser_debug',arguments:q})).isError);
  assert.equal(seen.length,0);
  for(const op of ['worker-sources','worker-source','worker-console','worker-profile'])assert(!(await c.callTool({name:'ios_browser_debug',arguments:{...base,op,...(op==='worker-source'?{scriptId:'7'}:{})}})).isError);
  assert.equal(seen.length,4);assert.equal(seen[1].debug.scriptId,'7');assert.equal(seen[2].debug.workerId,'worker:1');
 }finally{await c.close();await server.close();}
});
