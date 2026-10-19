import test from 'node:test';import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {Backend} from '../backend.mjs';import {createServer} from '../server.mjs';

test('build schema only dispatches fixed durable job actions and never acquires phone',async()=>{
 const seen=[];const b=new Backend({run:async(kind,args,input)=>{seen.push({kind,args,input});return {ok:true,value:{ok:true,jobId:'f'.repeat(32),state:input.action==='start'?'started':'completed',installed:false}};}});
 const {server}=createServer(b),[ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);const c=new Client({name:'build-job-test',version:'1'});await c.connect(ct);
 try{
  const resources=(await c.listResources()).resources;assert.equal(resources.length,11);assert(resources.some(r=>r.uri==='ios-agent://native-build'));
  const guide=await c.readResource({uri:'ios-agent://native-build'});assert(guide.contents[0].text.includes('Installation is still separate'));
  for(const a of [{action:'install'},{action:'retry'},{action:'start',jobId:'a'.repeat(32)},{action:'status',jobId:'../escape'}])assert((await c.callTool({name:'ios_build',arguments:a})).isError);
  assert.equal(seen.length,0);
  const r=(await c.callTool({name:'ios_build',arguments:{action:'start'}})).structuredContent;assert(r.ok);assert.equal(r.installed,false);assert.equal(seen[0].kind,'build');assert.deepEqual(seen[0].args,[]);
  const s=(await c.callTool({name:'ios_build',arguments:{action:'status',jobId:r.jobId}})).structuredContent;assert.equal(s.state,'completed');assert.equal(b.sessions.size,0);
 }finally{await c.close();await b.close();await server.close();}
});
