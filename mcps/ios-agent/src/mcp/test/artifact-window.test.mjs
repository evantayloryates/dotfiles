import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {Backend} from '../backend.mjs';
import {createServer} from '../server.mjs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';

test('large private arrays can be paged without partial JSON or ownership expansion',async()=>{
 const state=fs.mkdtempSync(path.join(os.tmpdir(),'ios-array-window-'));const b=new Backend({state});
 try{
  const saved=b.captureStore.saveDiagnostic({events:Array.from({length:500},(_,index)=>({index,text:'synthetic '.repeat(15)})),object:{count:500}});
  const id='a'.repeat(32);b.artifacts.set(id,{file:saved.file,type:'inspector'});
  assert.equal(b.read({artifactId:id,pointer:'/events'}).truncated,true);
  const first=b.read({artifactId:id,pointer:'/events',offset:0,count:20});assert.equal(first.data.length,20);assert.equal(first.data[0].index,0);assert.equal(first.pagination.nextOffset,20);
  const last=b.read({artifactId:id,pointer:'/events',offset:490,count:20});assert.deepEqual(last.pagination,{offset:490,count:10,total:500,nextOffset:null});assert.equal(last.data.at(-1).index,499);
  const beyond=b.read({artifactId:id,pointer:'/events',offset:500,count:20});assert.deepEqual(beyond.data,[]);assert.equal(beyond.pagination.nextOffset,null);
  const big=b.read({artifactId:id,pointer:'/events',offset:0,count:200,limit:100});assert.equal(big.truncated,true);assert(!('data' in big));
  for(const args of [{offset:0},{count:1},{offset:-1,count:1},{offset:0,count:201}])assert.throws(()=>b.read({artifactId:id,pointer:'/events',...args}),/bounded_array_window_required/);
  assert.throws(()=>b.read({artifactId:id,pointer:'/object',offset:0,count:1}),/array_pointer_required/);
  assert.throws(()=>b.read({artifactId:'b'.repeat(32),offset:0,count:1}),/artifact_not_owned/);
 }finally{await b.close();fs.rmSync(state,{recursive:true,force:true});}
});

test('MCP exposes paging and rejects invalid windows before backend read',async()=>{
 const seen=[];const {server}=createServer({read:x=>{seen.push(x);return {ok:true};},cancel:async()=>{},close:async()=>{}});
 const [ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);const c=new Client({name:'window-schema',version:'1'});await c.connect(ct);
 try{
  const args={artifactId:'a'.repeat(32),pointer:'/events',offset:20,count:30};assert(!(await c.callTool({name:'ios_read',arguments:args})).isError);assert.equal(seen[0].offset,20);assert.equal(seen[0].count,30);
  assert((await c.callTool({name:'ios_read',arguments:{...args,count:201}})).isError);assert.equal(seen.length,1);
 }finally{await c.close();await server.close();}
});
