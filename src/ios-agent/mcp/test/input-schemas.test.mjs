import test from 'node:test';import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';import {createServer} from '../server.mjs';
import {nativeSchemas,reactCommand} from '../input-schemas.mjs';
test('typed native/React requests reject mismatched or malformed fields before dispatch and preserve valid provider features',async()=>{
 const seen=[];const backend={action:async(...args)=>{seen.push(args);return {ok:true}},cancel:async()=>{},close:async()=>{}};
 const {server}=createServer(backend),[ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);const c=new Client({name:'input-schema',version:'1'});await c.connect(ct);
 const sessionId='a'.repeat(32);const call=(name,a)=>c.callTool({name,arguments:{sessionId,...a}});
 try{
  for(const a of [{action:'tap',args:{}},{action:'tree',args:{scale:2}},{action:'gesture',args:{snapshot:'s',target:'t',x:1,y:1,endX:2,endY:2,durationMs:49}},{action:'image',args:{scale:4}},{action:'text',args:{text:'hello',mode:'keypress'}},{action:'wifi',args:{state:'toggle'}},{action:'tap',args:{snapshot:'s',target:'t',x:-1,y:0}}])assert((await call('ios_native',a)).isError);
  for(const command of [{type:'find'},{type:'get-component',id:0,expression:'unsafe'},{type:'set-state',id:1},{type:'profile-commit',index:-1}])assert((await call('ios_react',{command})).isError);
  assert.equal(seen.length,0);
  await call('ios_native',{action:'text',args:{text:'',mode:'replace'}});assert.equal(seen[0][0].args.text,'');
  await call('ios_native',{action:'gesture',args:{snapshot:'observed',target:'observed',x:0,y:0,endX:10,endY:10,durationMs:5000}});assert.equal(seen[1][0].args.durationMs,5000);
  await call('ios_react',{command:{type:'get-tree',depth:8,noHost:true}});assert.equal(seen[2][1],true);
  assert((await call('ios_native',{action:'developer-probe',args:{host:'127.0.0.1'}})).isError);
  const before=seen.length;
  assert(!(await call('ios_native',{action:'developer-probe'})).isError);
  assert.equal(seen.length,before+1);assert.equal(seen.at(-1)[0].action,'developer-probe');
  const tools=(await c.listTools()).tools;const react=tools.find(x=>x.name==='ios_react');assert(JSON.stringify(react.inputSchema).includes('profile-timeline'));
  assert((await c.listResources()).resources.some(x=>x.uri==='ios-agent://native-input'));
 }finally{await c.close();await server.close();}
});
test('all current native actions and 15 provider command variants remain discoverable',()=>{
 assert.equal(Object.keys(nativeSchemas).length,14);
 for(const command of [{type:'ping'},{type:'status'},{type:'count'},{type:'errors'},{type:'get-tree'},{type:'get-component',id:0},{type:'find',name:'Test'},{type:'profile-start'},{type:'profile-stop'},{type:'profile-report',componentId:'Target#1'},{type:'profile-slow',limit:5},{type:'profile-rerenders'},{type:'profile-timeline',sort:'duration'},{type:'profile-commit',index:0},{type:'profile-export'}])assert(reactCommand.safeParse(command).success,command.type);
});
