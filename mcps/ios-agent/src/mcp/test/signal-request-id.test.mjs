import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createServer} from '../server.mjs';

const requestId=/^[a-f0-9]{16}$/;
async function connected(backend){
  const {server}=createServer(backend),client=new Client({name:'signal-request-fixture',version:'1'});
  const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);await client.connect(clientTransport);
  return {client,close:async()=>{await client.close();await server.close();}};
}

test('MCP success, safe error and image metadata expose an exact request ID',async()=>{
  const backend={
    deviceHome:async()=>({ok:true,inputSent:true,homeVerified:false}),
    read:()=>({image:'aW1hZ2U=',metadata:{scope:'fixture'}}),
  };
  const {client,close}=await connected(backend);
  try{
    const success=await client.callTool({name:'ios_device_home',arguments:{}});
    assert.match(success.structuredContent.signalRequestId,requestId);
    assert.equal(JSON.parse(success.content[0].text).signalRequestId,success.structuredContent.signalRequestId);
    assert.equal(success.structuredContent.inputSent,true);

    const image=await client.callTool({name:'ios_read',arguments:{artifactId:'a'.repeat(32)}});
    assert.equal(image.content[0].data,'aW1hZ2U=');
    assert.match(JSON.parse(image.content[1].text).signalRequestId,requestId);

    backend.deviceHome=async()=>{throw Error('private argument must not reach consumer');};
    const failure=await client.callTool({name:'ios_device_home',arguments:{}});
    assert.equal(failure.isError,true);
    assert.equal(failure.content[0].text,'mcp_operation_failed');
    assert.match(failure.structuredContent.signalRequestId,requestId);
    assert.equal(failure.content[1].text,`signalRequestId=${failure.structuredContent.signalRequestId}`);
    assert(!JSON.stringify(failure).includes('private argument'));
  }finally{await close();}
});

test('busy refusal reports its own request ID without changing the first error line',async()=>{
  let started,release;
  const entered=new Promise(resolve=>{started=resolve;});
  const held=new Promise(resolve=>{release=resolve;});
  const backend={waitReady:async()=>{started();await held;return {readyToAcquire:false};},deviceHome:async()=>({ok:true})};
  const {client,close}=await connected(backend);
  try{
    const pending=client.callTool({name:'ios_wait_ready',arguments:{timeoutSeconds:0}});
    await entered;
    const busy=await client.callTool({name:'ios_device_home',arguments:{}});
    assert.equal(busy.isError,true);
    assert.equal(busy.content[0].text,'MCP call in flight; wait for its result. No command was admitted.');
    assert.match(busy.structuredContent.signalRequestId,requestId);
    assert.equal(busy.content[1].text,`signalRequestId=${busy.structuredContent.signalRequestId}`);
    release();
    const waited=await pending;
    assert.match(waited.structuredContent.signalRequestId,requestId);
    assert.notEqual(waited.structuredContent.signalRequestId,busy.structuredContent.signalRequestId);
  }finally{release();await close();}
});

test('app_not_ready names the launch step without changing the first error line',async()=>{
  const backend={begin:async()=>{throw Error('app_not_ready');}};
  const {client,close}=await connected(backend);
  try{
    const refused=await client.callTool({name:'ios_begin',arguments:{}});
    assert.equal(refused.isError,true);
    assert.equal(refused.content[0].text,'app_not_ready');
    assert.equal(refused.content[1].text,`signalRequestId=${refused.structuredContent.signalRequestId}`);
    assert.match(refused.structuredContent.next,/ios_device_launch target=kickoff-dev/);
    assert.equal(refused.content[2].text,`next=${refused.structuredContent.next}`);
    assert.equal(refused.structuredContent.reason,'app_not_ready');
  }finally{await close();}
});

test('a native begin with no registered DEV app also names the launch step',async()=>{
  const backend={begin:async()=>{throw Error('device_not_connected');}};
  const {client,close}=await connected(backend);
  try{
    const refused=await client.callTool({name:'ios_begin',arguments:{}});
    assert.equal(refused.content[0].text,'device_not_connected');
    assert.match(refused.structuredContent.next,/ios_device_launch target=kickoff-dev/);
    backend.begin=async()=>{throw Error('end_existing_session_first');};
    const other=await client.callTool({name:'ios_begin',arguments:{}});
    assert.equal(other.structuredContent.next,undefined);assert.equal(other.content.length,2);
  }finally{await close();}
});
