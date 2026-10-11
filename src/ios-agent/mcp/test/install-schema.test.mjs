import test from 'node:test';import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {Backend} from '../backend.mjs';import {createServer} from '../server.mjs';
test('MCP install exposes only fixed job/receipt identifiers; invalid input never dispatches',async()=>{
 const b=new Backend(),calls=[];b.installJob=async q=>{calls.push(q);return {ok:true,steps:[]};};
 const {server}=createServer(b),[ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);const c=new Client({name:'install-schema',version:'1'});await c.connect(ct);
 try{
  for(const args of [{action:'start'},{action:'start',jobId:'../escape'},{action:'plan',installId:'a'.repeat(32)},{action:'status',jobId:'a'.repeat(32)},{action:'start',jobId:'a'.repeat(32),installId:'b'.repeat(32)},{action:'retry'}])assert((await c.callTool({name:'ios_install',arguments:args})).isError);
  assert.equal(calls.length,0);
  assert(!(await c.callTool({name:'ios_install',arguments:{action:'start',jobId:'a'.repeat(32)}})).isError);assert.equal(calls.length,1);
 }finally{await c.close();await b.close();await server.close();}
});
