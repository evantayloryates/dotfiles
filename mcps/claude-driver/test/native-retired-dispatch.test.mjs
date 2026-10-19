import test from 'node:test'
import assert from 'node:assert/strict'
import {runInNewContext} from 'node:vm'
import {resolveClaudeBinary,cliVersionFromPath} from '../src/lib/paths.mjs'
import {installedWindowContaining} from '../src/lib/installed-source.mjs'
test('installed dispatcher excludes retiring and unloaded receivers before matcher and entry',async()=>{
 const binary=resolveClaudeBinary();assert.equal(cliVersionFromPath(binary),'2.1.299','unqualified dispatch symbol profile')
 const w=installedWindowContaining(binary,'async function vgr(',{before:55000,after:1800}),source=w.text
 const cut=(a,b)=>{const i=source.indexOf(a),j=source.indexOf(b,i);assert.ok(i>=0&&j>i);assert.equal(source.indexOf(a,i+1),-1);return source.slice(i,j)}
 const filter=cut('function Z(','var $Hn='),select=cut('function he(','function te('),dispatch=cut('async function vgr(','function we(')
 for(const state of [{kind:'retiring'},{kind:'unloaded',retired:true},{kind:'unloaded',retired:false},{kind:'dead',reason:'owned test'},{kind:'live'}]){
  const calls={matcher:0,enter:0,leave:0,dispatch:0,next:0}
  const member={name:'owned',label:'owned',status:()=>state,enter:()=>calls.enter++,leave:()=>calls.leave++,hopKey:{kind:'worker',dispatch:async()=>{calls.dispatch++;return {result:'hook'}}}}
  const fn=runInNewContext(`${filter};${select};${dispatch};vgr`,{t:()=>{},bgr:()=>{calls.matcher++;return true},performance:{now:()=>0},J:x=>x,tt:x=>x,te:()=>false,jRt:()=> 'owned'})
  const result=await fn({members:[member],event:'session.receive',e:{},floors:[],call:()=>{calls.next++;return 'next'}})
  if(state.kind==='live'){assert.equal(result,'hook');assert.deepEqual(calls,{matcher:1,enter:1,leave:1,dispatch:1,next:0})}
  else{assert.equal(result,'next');assert.deepEqual(calls,{matcher:0,enter:0,leave:0,dispatch:0,next:1})}
 }
})
