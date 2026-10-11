import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {Backend} from '../backend.mjs';
import {createServer} from '../server.mjs';

test('matrix schema and backend dispatch only fixed simulator operations; reconnect can read job',async()=>{
 const seen=[];const backend=new Backend({run:async(kind,args,input)=>{seen.push({kind,args,input});return {ok:true,value:{ok:true,jobId:'a'.repeat(32),state:input.action==='start'?'started':'completed',cleanupVerified:input.action==='status'}};}});
 const {server}=createServer(backend),[ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);const c=new Client({name:'input-matrix',version:'1'});await c.connect(ct);
 try{
  const tools=(await c.listTools()).tools;assert(tools.some(t=>t.name==='ios_input_matrix'));
  assert((await c.callTool({name:'ios_input_matrix',arguments:{action:'start',jobId:'a'.repeat(32)}})).isError);assert.equal(seen.length,0);
  assert((await c.callTool({name:'ios_input_matrix',arguments:{action:'shell'}})).isError);assert.equal(seen.length,0);
  const start=(await c.callTool({name:'ios_input_matrix',arguments:{action:'start'}})).structuredContent;assert.equal(start.state,'started');assert.equal(seen[0].kind,'fixture');assert.deepEqual(seen[0].args,[]);
  const state=(await c.callTool({name:'ios_input_matrix',arguments:{action:'status',jobId:start.jobId}})).structuredContent;assert.equal(state.cleanupVerified,true);assert.equal(backend.sessions.size,0);
 }finally{await c.close();await backend.close();await server.close();}
 const b=new Backend({run:async(kind,args,input)=>({ok:true,value:{ok:true,state:'completed',jobId:input.jobId}})});
 try{assert.equal((await b.inputMatrix({action:'status',jobId:'a'.repeat(32)})).state,'completed');}finally{await b.close();}
});
