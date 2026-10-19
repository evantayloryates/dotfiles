import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Backend} from '../backend.mjs';

async function fixture(){
 const state=fs.mkdtempSync(path.join(os.tmpdir(),'ios-managed-relay-'));
 const python=path.join(state,'providers/pymobiledevice3-11.15.5/bin/python');
 fs.mkdirSync(path.dirname(python),{recursive:true});fs.writeFileSync(python,'');
 fs.writeFileSync(path.join(state,'web-device.json'),JSON.stringify({coreDeviceId:'EFF7037C-94D3-5222-AB4A-770D3AB5BBC9',hardwareUDID:'00008110-001451690A21801E'}),{mode:0o600});
 const calls=[];
 const b=new Backend({state,run:async(kind,args)=>{
  calls.push([kind,args?.[0]]);
  if(kind==='cli'&&args[0]==='acquire'){fs.writeFileSync(args[args.indexOf('--lease-file')+1],JSON.stringify({lease:'fixture-private'}));return {ok:true};}
  if(kind==='cli'&&args[0]==='release')return {ok:true,value:{released:true}};
  throw Error('unexpected alternate provider or device operation');
 }});
 const session=(await b.begin({surface:'launch'})).sessionId;
 return {b,state,session,calls,async close(){await b.close();fs.rmSync(state,{recursive:true,force:true});}};
}

test('managed Inspector reuses authenticated channel; Home precedes owner retirement',async()=>{
 const f=await fixture(),operations=[];const s=f.b.session(f.session);
 s.relayChannel={async request(op,{request}){
  operations.push(request.kind);assert.equal(s.active,true);
  assert.equal(JSON.parse(fs.readFileSync(s.owner)).active,true);
  return {ok:true,transport:'reflected-pairing/direct-secondary-userspace',value:request.kind==='browser-debug'?{pages:[{readConfirmed:true,debug:{operation:'dom',documentRef:'a'.repeat(32),ready:'complete'}}]}:{inputSent:true}};
 },async close(){operations.push('closed');return {closed:true};}};
 try{
  const read=await f.b.deviceInspect({kind:'browser-debug',sessionId:f.session,debug:{browser:'chrome',op:'dom'}});
  assert.equal(read.ok,true);assert.equal(read.metadata.transport,'reflected-pairing/direct-secondary-userspace');
  assert(!f.calls.some(([kind])=>kind==='provider'));
  const end=await f.b.end(f.session);assert.equal(end.relayCleanup.homeRequested,true);assert.equal(end.relayCleanup.tunnelClosed,true);
  assert.deepEqual(operations,['browser-debug','shortcut-home','closed']);
 }finally{await f.close();}
});

test('lost ownership closes managed channel without sending cleanup input',async()=>{
 const f=await fixture(),s=f.b.session(f.session);let closed=false;
 s.relayChannel={async request(){throw Error('must not send after ownership loss');},async close(){closed=true;return {closed:true};}};
 s.active=false;f.b.writeOwner(s);
 try{const end=await f.b.end(f.session);assert.equal(closed,true);assert.equal(end.relayCleanup.tunnelClosed,true);assert.equal(end.relayCleanup.homeRequested,undefined);}
 finally{await f.close();}
});
