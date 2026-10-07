import test from 'node:test'
import assert from 'node:assert/strict'
import {runInNewContext} from 'node:vm'
import {resolveClaudeBinary} from '../lib/paths.mjs'
import {installedWindowContaining} from '../lib/installed-source.mjs'
test('installed dispatcher excludes retiring and unloaded receivers before matcher and entry',async()=>{
 const w=installedWindowContaining(resolveClaudeBinary(),'function f4n(',{before:5000,after:1300}),source=w.text
 const cut=(a,b)=>{const i=source.indexOf(a),j=source.indexOf(b,i);assert.ok(i>=0&&j>i);assert.equal(source.indexOf(a,i+1),-1);return source.slice(i,j)}
 const filter=cut('function ae(','function fe('),select=cut('function fe(','var iNo='),dispatch=cut('async function f4n(','function ue(')
 for(const state of [{kind:'retiring'},{kind:'unloaded',retired:true},{kind:'unloaded',retired:false},{kind:'dead',reason:'owned test'},{kind:'live'}]){
  const calls={matcher:0,enter:0,leave:0,dispatch:0,next:0}
  const member={name:'owned',label:'owned',status:()=>state,enter:()=>calls.enter++,leave:()=>calls.leave++,hopKey:{kind:'worker',dispatch:async()=>{calls.dispatch++;return {result:'hook'}}}}
  const fn=runInNewContext(`${filter};${select};${dispatch};f4n`,{t:()=>{},c4n:()=>{calls.matcher++;return true},performance:{now:()=>0},le:x=>x,Ae:x=>x,d4n:()=> 'owned'})
  const result=await fn({members:[member],event:'session.receive',e:{},floors:[],call:()=>{calls.next++;return 'next'}})
  if(state.kind==='live'){assert.equal(result,'hook');assert.deepEqual(calls,{matcher:1,enter:1,leave:1,dispatch:1,next:0})}
  else{assert.equal(result,'next');assert.deepEqual(calls,{matcher:0,enter:0,leave:0,dispatch:0,next:1})}
 }
})
