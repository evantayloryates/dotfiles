import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {planNativeTap} from '../native-selector.mjs';
import {nativeSchemas} from '../input-schemas.mjs';
import {Backend} from '../backend.mjs';
const node={node:'input',label:'Description',identifier:'meal-description',class:'RCTUITextView',visible:true,interactive:true,rect:[20,80,120,40]};
test('exact selector refuses ambiguity, hidden/noninteractive/malformed candidates and mixed point arguments',()=>{
 const tree={snapshot:'fresh',nodes:[node]};
 assert.deepEqual(planNativeTap(tree,{identifier:'meal-description'}).point,{snapshot:'fresh',target:'input',x:80,y:100});
 assert.equal(planNativeTap(tree,{label:'description'}).reason,'native_selector_not_found');
 assert.equal(planNativeTap(tree,{}).reason,'native_selector_invalid');
 assert.equal(planNativeTap({...tree,truncated:true},{label:'Description'}).reason,'native_selector_tree_unavailable');
 assert.equal(planNativeTap({...tree,nodes:[node,{...node,node:'other'}]},{class:'RCTUITextView'}).reason,'native_selector_ambiguous');
 for(const patch of [{visible:false},{interactive:false},{rect:[0,0,0,2]},{rect:[0,0,NaN,2]}])assert.equal(planNativeTap({...tree,nodes:[{...node,...patch}]},{label:'Description'}).reason,'native_selector_not_found');
 for(const args of [{selector:{}},{selector:{label:'x',ordinal:2}},{selector:{label:'x'},snapshot:'s',target:'t',x:0,y:0}])assert.equal(nativeSchemas.tap.safeParse(args).success,false);
 assert(nativeSchemas.tap.safeParse({selector:{class:'RCTUITextView'}}).success);
});
test('backend matches full private tree and dispatches once; ambiguous/read failure never sends touch',async()=>{
 const state=fs.mkdtempSync(path.join(os.tmpdir(),'native-selector-'));let taps=0,reads=0,ambiguous=false,readFailed=false;
 const b=new Backend({state,run:async(_kind,args)=>{
  const file=args[args.indexOf('--output')+1];
  if(args[1]==='tree'){
   reads++;fs.writeFileSync(file,JSON.stringify({result:{snapshot:'fresh',nodes:[...Array.from({length:150},(_,i)=>({...node,label:'Other',node:String(i),identifier:String(i)})),node,...(ambiguous?[{...node,node:'duplicate'}]:[])]}}));return {ok:!readFailed};
  }
  assert.equal(args[1],'tap');taps++;assert.deepEqual(JSON.parse(args[args.indexOf('--args')+1]),{snapshot:'fresh',target:'input',x:80,y:100});
  fs.writeFileSync(file,JSON.stringify({status:'unknown',result:{accepted:true}}));return {ok:false,error:'action_not_confirmed'};
 }});
 const s={id:'a'.repeat(32),active:true,dir:state,owner:path.join(state,'owner.json'),activity:Date.now(),lease:path.join(state,'lease')};b.sessions.set(s.id,s);
 try{
  const unknown=await b.action({sessionId:s.id,action:'tap',args:{selector:{identifier:'meal-description'}}});assert.equal(unknown.ok,false);assert.equal(unknown.replay,false);assert.equal(taps,1);assert.equal(reads,1);
  ambiguous=true;const denied=await b.action({sessionId:s.id,action:'tap',args:{selector:{identifier:'meal-description'}}});assert.equal(denied.reason,'native_selector_ambiguous');assert.equal(denied.actionSent,false);assert.equal(taps,1);
  readFailed=true;assert.equal((await b.action({sessionId:s.id,action:'tap',args:{selector:{identifier:'meal-description'}}})).reason,'native_selector_tree_failed');assert.equal(taps,1);
 }finally{b.sessions.clear();await b.close();fs.rmSync(state,{recursive:true,force:true});}
});
