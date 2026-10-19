import test from 'node:test';
import assert from 'node:assert/strict';
import {waitNativeElement} from '../native-condition.mjs';
const n={node:'native-control',identifier:'nutrition-settings',visible:true,interactive:true,rect:[10,20,80,30]};
function fixture(){let t=0,calls=0;return {now:()=>t,pause:async ms=>{t+=ms;},owned:()=>{},read:async()=>({snapshot:'fresh-'+ ++calls,nodes:calls===1?[]:[n]})};}
test('waits for a delayed real hierarchy match and returns only fresh exact references',async()=>{
 const f=fixture();const r=await waitNativeElement({...f,selector:{identifier:n.identifier},state:'interactable'});assert.equal(r.receipt.status,'passed');assert.equal(r.receipt.attempts,2);assert.equal(r.receipt.elapsedMs,600);assert.equal(r.reference.snapshot,'fresh-2');assert.equal(r.reference.target,n.node);assert.equal(r.inputSent,false);
});
test('ambiguity, truncated reads, read failure and ownership loss stop without retries/input',async()=>{
 for(const read of [async()=>({snapshot:'fresh',nodes:[n,{...n,node:'other'}]}),async()=>({snapshot:'fresh',nodes:[n],truncated:true}),async()=>{throw Error('offline');}]){
  let reads=0;const r=await waitNativeElement({...fixture(),selector:{identifier:n.identifier},read:async()=>{reads++;return read();}});assert.equal(r.receipt.status,'failed');assert.equal(reads,1);assert.equal(r.inputSent,false);assert(!r.reference);
 }
 let checks=0;const r=await waitNativeElement({...fixture(),selector:{identifier:n.identifier},read:async()=>({snapshot:'f',nodes:[n]}),owned:()=>{if(++checks>1)throw Error('replaced');}});assert.equal(r.receipt.status,'failed');assert(!r.reference);
});
test('timeout, wrong exact case, hidden/noninteractive targets and cancellation never pass',async()=>{
 for(const patch of [{visible:false},{interactive:false},{identifier:'Nutrition-settings'}]){
  const f=fixture();const r=await waitNativeElement({...f,selector:{identifier:n.identifier},state:'interactable',timeout:1,read:async()=>({snapshot:'f',nodes:[{...n,...patch}]})});assert.equal(r.receipt.status,'failed');assert(!r.reference);assert(r.receipt.elapsedMs<=1000);
 }
 const c=new AbortController();c.abort();const r=await waitNativeElement({...fixture(),selector:{identifier:n.identifier},signal:c.signal});assert.equal(r.receipt.attempts,0);assert.equal(r.receipt.reason,'cancelled');
 await assert.rejects(waitNativeElement({...fixture(),selector:{ordinal:1}}),/arguments_required/);
});

test('MCP integration reads full private tree, persists bounded receipt and refuses malformed gate arguments',async()=>{
 const fs=await import('node:fs');const os=await import('node:os');const path=await import('node:path');
 const {Backend}=await import('../backend.mjs');const {createServer}=await import('../server.mjs');
 const {Client}=await import('@modelcontextprotocol/sdk/client/index.js');const {InMemoryTransport}=await import('@modelcontextprotocol/sdk/inMemory.js');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'native-condition-'));let calls=0;
 const b=new Backend({state:dir,run:async(kind,args,input)=>{
  if(kind==='learning')return {ok:true,value:{evidenceId:'e'.repeat(32)}};
  if(args[0]==='status')return {ok:true,value:{sourceHash:'a'.repeat(64),device:{boot:'fixture',bundle:'com.dev.kudos.fit'}}};
  assert.equal(args[0],'action');assert.equal(args[1],'tree');calls++;
  fs.writeFileSync(args[args.indexOf('--output')+1],JSON.stringify({result:{snapshot:'fresh',nodes:[...Array.from({length:150},(_,i)=>({...n,identifier:'other',node:String(i)})),n]}}));return {ok:true};
 }});
 const s={id:'a'.repeat(32),active:true,dir,owner:path.join(dir,'owner.json'),activity:Date.now(),lease:path.join(dir,'lease')};b.sessions.set(s.id,s);
 const {server}=createServer(b);const [ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);const c=new Client({name:'test',version:'1'});await c.connect(ct);
 try{
  const r=(await c.callTool({name:'ios_verify',arguments:{sessionId:s.id,gate:'native-element',selector:{identifier:n.identifier}}})).structuredContent;
  assert.equal(r.receipt.status,'passed');assert.equal(r.reference.target,n.node);assert.equal(r.learningEvidence.evidenceId,'e'.repeat(32));assert.equal(calls,1);
  const raw=b.read({artifactId:r.artifactId});assert(raw);
  for(const args of [{gate:'native-element'},{sessionId:s.id,gate:'native-element',selector:{identifier:n.identifier},expected:'not-supported'},{sessionId:s.id,gate:'ready',selector:{label:'wrong'}},{sessionId:s.id,gate:'native-element',selector:{ordinal:2}}])assert.equal((await c.callTool({name:'ios_verify',arguments:args})).isError,true);
  assert.equal(calls,1);
 }finally{b.sessions.clear();await c.close();await server.close();await b.close();fs.rmSync(dir,{recursive:true,force:true});}
});
