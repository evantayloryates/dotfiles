import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {retainedRunner} from '../system-reservation.mjs';
import {SystemDriver} from '../system-driver.mjs';
import {Backend} from '../backend.mjs';
process.env.IOS_AGENT_EXPERIMENTAL_RETENTION='1';
function fixture(){
 const state=fs.mkdtempSync(path.join(os.tmpdir(),'ios-retention-test-'));fs.chmodSync(state,0o700);
 const root=path.join(state,'system-reservations');fs.mkdirSync(root,{mode:0o700});
 const now=Date.now()/1000,r={version:1,id:'a'.repeat(32),createdAt:now,expiresAt:now+600,pid:process.pid,active:true,ready:true,phase:'ready',sessionId:'b'.repeat(36)};
 const write=()=>{for(const name of ['current.json',r.id+'.json'])fs.writeFileSync(path.join(root,name),JSON.stringify(r),{mode:0o600});};write();
 fs.writeFileSync(path.join(state,'system-driver.json'),JSON.stringify({address:'100.106.65.81'}),{mode:0o600});fs.writeFileSync(path.join(state,'web-device.json'),JSON.stringify({hardwareUDID:'configured-device'}),{mode:0o600});
 return {state,root,r,write,cleanup:()=>fs.rmSync(state,{recursive:true,force:true})};
}
test('retention metadata cannot grant input, outlive expiry or accept private-file replacement',()=>{
 const f=fixture();try{
  assert.equal(retainedRunner(f.state).id,f.r.id);assert.equal(retainedRunner(f.state,f.r.expiresAt),null);
  fs.writeFileSync(path.join(f.root,f.r.id+'.stop'),'');assert.equal(retainedRunner(f.state),null);fs.unlinkSync(path.join(f.root,f.r.id+'.stop'));
  const file=path.join(f.root,f.r.id+'.json');fs.chmodSync(file,0o644);assert.throws(()=>retainedRunner(f.state),/private_reservation_required/);fs.chmodSync(file,0o600);
  fs.unlinkSync(file);fs.symlinkSync(path.join(f.root,'current.json'),file);assert.throws(()=>retainedRunner(f.state));
 }finally{f.cleanup();}
});
test('retained fallback attaches without a new runner/session and releases input separately',async()=>{
 const f=fixture(),calls=[];let checks=0,authorizations=0;
 const d=new SystemDriver({state:f.state,session:{},check:()=>{checks++},authorize:async()=>{authorizations++}});
 d.http=async(m,r)=>{calls.push([m,r]);return {sessionId:f.r.sessionId,value:{ready:true}}};
 try{
  const started=await d.start();assert.equal(started.retained,true);assert.equal(authorizations,1);assert(checks>0);assert.deepEqual(calls,[['GET','/status']]);
  const ended=await d.stop();assert.equal(ended.retained,true);assert.equal(ended.runnerStopped,false);assert.equal(calls.length,1);assert.equal(d.child,null);
 }finally{f.cleanup();}
});
test('retained fallback rejects changed native session and reservation expiry before input',async()=>{
 const f=fixture();try{
  const bad=new SystemDriver({state:f.state,session:{},check:()=>{}});bad.http=async()=>({sessionId:'c'.repeat(36),value:{ready:true}});
  assert.equal((await bad.start()).reason,'retained_runner_identity_unconfirmed');assert.equal(bad.sid,undefined);
  const d=new SystemDriver({state:f.state,session:{},check:()=>{}});d.http=async()=>({sessionId:f.r.sessionId,value:{ready:true}});assert.equal((await d.start()).ok,true);
  fs.writeFileSync(path.join(f.root,f.r.id+'.stop'),'');await assert.rejects(d.action({action:'home'}),/retained_runner_unavailable/);
  assert.equal((await d.stop()).ok,false);
 }finally{f.cleanup();}
});
test('reservation candidate fails closed before admission unless explicitly opted in',async()=>{
 const prior=process.env.IOS_AGENT_EXPERIMENTAL_RETENTION;delete process.env.IOS_AGENT_EXPERIMENTAL_RETENTION;
 const b=new Backend({run:async()=>{throw Error('must not dispatch')}});
 try{assert.equal((await b.systemReservation({action:'start'})).reason,'runner_retention_candidate_not_physically_qualified');}
 finally{await b.close();if(prior===undefined)delete process.env.IOS_AGENT_EXPERIMENTAL_RETENTION;else process.env.IOS_AGENT_EXPERIMENTAL_RETENTION=prior;}
});
test('experimental MCP schema is opt-in and validates bounded duration before backend dispatch',async()=>{
 const {createServer}=await import('../server.mjs');const {Client}=await import('@modelcontextprotocol/sdk/client/index.js');const {InMemoryTransport}=await import('@modelcontextprotocol/sdk/inMemory.js');
 const prior=process.env.IOS_AGENT_EXPERIMENTAL_RETENTION;delete process.env.IOS_AGENT_EXPERIMENTAL_RETENTION;
 const normal=createServer({});assert(!normal.catalog().tools.includes('ios_system_reservation'));await normal.server.close();
 process.env.IOS_AGENT_EXPERIMENTAL_RETENTION='1';const seen=[];
 const {server}=createServer({systemReservation:async args=>{seen.push(args);return {ok:true}},cancel:async()=>{},close:async()=>{}});
 const [ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);const c=new Client({name:'retention-candidate-test',version:'1'});await c.connect(ct);
 try{
  assert(!(await c.callTool({name:'ios_system_reservation',arguments:{action:'status'}})).isError);
  assert((await c.callTool({name:'ios_system_reservation',arguments:{action:'start',durationSeconds:36001}})).isError);assert.equal(seen.length,1);
 }finally{await c.close();await server.close();if(prior===undefined)delete process.env.IOS_AGENT_EXPERIMENTAL_RETENTION;else process.env.IOS_AGENT_EXPERIMENTAL_RETENTION=prior;}
});
