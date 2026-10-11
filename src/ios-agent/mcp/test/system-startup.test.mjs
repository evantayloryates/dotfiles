import test from 'node:test';
import assert from 'node:assert/strict';
import {SystemDriver} from '../system-driver.mjs';
function fixture(){
  let ready=false,creates=0,owned=true;
  const d=new SystemDriver({state:'/unused',session:{},check:()=>{if(!owned)throw Error('owner_not_active');}});
  d.child={exitCode:null};d.startupDeadline=Date.now()+300000;
  d.http=async(method,route)=>{if(route==='/status')return {value:{ready}};assert.equal(route,'/session');creates++;return {sessionId:'a'.repeat(36)};};
  return {d,setReady:()=>{ready=true;},loseOwner:()=>{owned=false;},creates:()=>creates};
}
test('pending authorization keeps one attempt and refuses input until the same runner becomes ready',async()=>{
  const f=fixture(),pending=await f.d.continueStart(0);
  assert.equal(pending.ok,true);assert.equal(pending.ready,false);assert.equal(pending.phase,'starting');assert.equal(f.creates(),0);
  assert.deepEqual(await f.d.action({action:'home'}),{ok:false,reason:'system_not_ready',actionSent:false,replay:false});
  f.setReady();assert.equal((await f.d.continueStart(0)).ready,true);assert.equal(f.creates(),1);assert.equal(f.d.sid,'a'.repeat(36));
});
test('expiry, dead runner, cancellation and lost ownership cannot create a late session',async()=>{
  for(const mode of ['expiry','exit','cancel','owner']){
    const f=fixture();f.setReady();
    if(mode==='expiry')f.d.startupDeadline=Date.now()-1;
    if(mode==='exit')f.d.child.exitCode=1;
    if(mode==='cancel')f.d.stoppingRequested=true;
    if(mode==='owner')f.loseOwner();
    if(mode==='owner')await assert.rejects(f.d.continueStart(0),/owner_not_active/);
    else assert.equal((await f.d.continueStart(0)).ok,false);
    assert.equal(f.creates(),0);
  }
});
test('cancellation during provider session creation never grants input authority',async()=>{
  const f=fixture();f.setReady();const http=f.d.http;
  f.d.http=async(...args)=>{const r=await http(...args);if(args[1]==='/session')f.d.stoppingRequested=true;return r;};
  assert.equal((await f.d.continueStart(0)).reason,'system_start_cancelled');assert.equal(f.d.sid,undefined);
});
