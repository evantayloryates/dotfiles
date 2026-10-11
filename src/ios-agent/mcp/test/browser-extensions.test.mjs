import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createServer} from '../server.mjs';
test('new browser schema validates CSS refs and explicit remembrance before dispatch',async()=>{
 const seen=[];const backend={close:async()=>{},webAction:async x=>{seen.push(x);return {ok:true}},webEnroll:async x=>{seen.push(x);return {ok:true}}};
 const {server}=createServer(backend),[ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);const client=new Client({name:'browser-schema',version:'1'});await client.connect(ct);
 try{
  assert.equal(client.getServerVersion().version,'1.9.7');
  const malformed=await client.callTool({name:'ios_web_inspect',arguments:{sessionId:'a'.repeat(32),kind:'element'}});assert.equal(malformed.structuredContent.reason,'fresh_snapshot_and_target_required');assert.equal(seen.length,0);
  const valid=await client.callTool({name:'ios_web_inspect',arguments:{sessionId:'a'.repeat(32),kind:'element',snapshot:'fresh',target:'1'}});assert(!valid.isError);assert.deepEqual(seen.pop().args,{snapshot:'fresh',target:'1'});
  await client.callTool({name:'ios_web_enroll',arguments:{}});assert.equal(seen.pop().rememberBrowser,false);
  await client.callTool({name:'ios_web_enroll',arguments:{rememberBrowser:true}});assert.equal(seen.pop().rememberBrowser,true);
 }finally{await client.close();await server.close();}
});
import {webProfileOrigin} from '../web-profiles.mjs';
test('named call-rig origin preserves the private host and refuses arbitrary origins/profiles',()=>{
 assert.equal(webProfileOrigin('https://dev.tail.ts.net:10446/'),'https://dev.tail.ts.net:10446');
 assert.equal(webProfileOrigin('https://dev.tail.ts.net:10446/','call-rig'),'https://dev.tail.ts.net:10520');
 for(const url of ['https://dev.tail.ts.net.evil:10446/','https://token@dev.tail.ts.net:10446/','https://dev.tail.ts.net:10446/path','http://dev.tail.ts.net:10446/','https://dev.tail.ts.net:10520/'])assert.throws(()=>webProfileOrigin(url,'call-rig'));
 assert.throws(()=>webProfileOrigin('https://dev.tail.ts.net:10446/','arbitrary'));
});
