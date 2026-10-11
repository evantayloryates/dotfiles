import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
const state=fs.mkdtempSync(path.join(os.tmpdir(),'ios-signal-reader-'));
const previous=process.env.IOS_AGENT_SIGNAL_STATE_DIR;
process.env.IOS_AGENT_SIGNAL_STATE_DIR=state;
const {parseSignalOptions}=await import('../signals-cli.mjs');
const {emitSignal,readSignals}=await import('../signal-log.mjs');
after(()=>{
  if (previous===undefined) delete process.env.IOS_AGENT_SIGNAL_STATE_DIR; else process.env.IOS_AGENT_SIGNAL_STATE_DIR=previous;
  fs.rmSync(state,{recursive:true,force:true});
});

test('CLI filters are bounded and never accept arbitrary files',()=>{
  assert.equal(parseSignalOptions(['--trace','a'.repeat(16),'--limit','8','--json']).options.limit,8);
  for (const args of [['--path','/tmp/log'],['--bytes','999999'],['--limit','0'],['--since','yesterday']])
    assert.throws(()=>parseSignalOptions(args));
});

test('actual MCP reader works during a pending control call and exposes its trace',async()=>{
  const {createServer}=await import('../server.mjs');
  let entered,finish;
  const started=new Promise(resolve=>{entered=resolve;});
  const held=new Promise(resolve=>{finish=resolve;});
  const {server}=createServer({waitReady:async()=>{entered();await held;return {readyToAcquire:false};}});
  const client=new Client({name:'signal-reader-fixture',version:'1'});
  const [a,b]=InMemoryTransport.createLinkedPair();
  try {
    await server.connect(b);await client.connect(a);
    const pending=client.callTool({name:'ios_wait_ready',arguments:{timeoutSeconds:0}});
    await started;
    const read=await client.callTool({name:'ios_signals',arguments:{event:'request.admitted',limit:5,maxBytes:256}});
    assert.notEqual(read.isError,true);
    assert(read.structuredContent.count>0);
    assert(Buffer.byteLength(read.structuredContent.text)+1<=256);
    assert(read.content[0].text.includes('ios_wait_ready'));
    assert.equal(read.structuredContent.signalRequestId,undefined);
    finish();const ended=await pending;
    const exact=await client.callTool({name:'ios_signals',arguments:{traceId:ended.structuredContent.signalRequestId}});
    assert(exact.structuredContent.text.includes('request.completed'));
    assert(!exact.structuredContent.text.includes('tool=ios_signals'));
  } finally {
    finish();await client.close();await server.close();
  }
});

test('small read pages make progress over bounded error details',()=>{
  assert(emitSignal('mcp','fixture.operation_failed',{level:'error',message:'fixture '.repeat(20),stack:'frame '.repeat(40),traceId:'b'.repeat(16)}));
  const page=readSignals({event:'fixture.operation_failed',maxBytes:256,limit:1});
  assert.equal(page.count,1);assert(Buffer.byteLength(page.text)+1<=256);assert(page.text.endsWith(' …'));
});
