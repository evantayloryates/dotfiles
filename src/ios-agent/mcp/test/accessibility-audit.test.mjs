import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {Backend} from '../backend.mjs';
for(const failure of [false,true])test(`accessibility ${failure?'refuses missing foreground':'expires private content and exposes only summary'} and releases temporary owner`,async()=>{
 const state=fs.mkdtempSync(path.join(os.tmpdir(),'ios-audit-'));let held=false,count=0;
 const python=path.join(state,'providers/pymobiledevice3-11.15.5/bin/python');fs.mkdirSync(path.dirname(python),{recursive:true});fs.writeFileSync(python,'');
 fs.writeFileSync(path.join(state,'web-device.json'),JSON.stringify({coreDeviceId:'EFF7037C-94D3-5222-AB4A-770D3AB5BBC9',hardwareUDID:'00008110-001451690A21801E'}),{mode:0o600});
 const b=new Backend({state,deviceRun:async()=>{throw Error('unexpected device call')},run:async(kind,args,input)=>{
  if(kind==='cli'&&args[0]==='acquire'){held=true;fs.writeFileSync(args[args.indexOf('--lease-file')+1],JSON.stringify({lease:'fixture'}));return {ok:true};}
  if(kind==='cli'&&args[0]==='release'){held=false;fs.unlinkSync(args[args.indexOf('--lease-file')+1]);return {ok:true,value:{released:true}};}
  if(kind==='provider'){count++;assert(held);assert.equal(input.kind,'accessibility-audit');assert.deepEqual(input.audit,{target:'safari',profile:'call-rig'});
   if(failure)return {ok:false,value:{reason:'foreground_dev_surface_required',inputSent:false,diagnostic:{}}};
   fs.writeFileSync(input.output,JSON.stringify({result:{scope:'dev-static-accessibility-audit',issueCount:1,reportedIssueCount:1,droppedIssues:0,auditCompleted:true,auditChannelClosed:true,foregroundVerified:true,issues:[{issue_classification:'testTypeHitRegion',long_description_extra_info:'private detail'}]}}));return {ok:true,value:{ok:true}};
  }throw Error('unexpected '+kind);
 }});
 try{const r=await b.deviceInspect({kind:'accessibility-audit',audit:{target:'safari',profile:'call-rig'}});assert.equal(count,1);assert(!held);assert.equal(r.inputSent,false);
  if(failure){assert.equal(r.ok,false);assert.equal(r.reason,'foreground_dev_surface_required');}else{assert(!JSON.stringify(r).includes('private detail'));assert.equal(r.metadata.retentionSeconds,3600);assert.equal(b.read({artifactId:r.artifactId,pointer:'/result/issues',offset:0,count:1}).data[0].long_description_extra_info,'private detail');const a=b.artifacts.get(r.artifactId);assert.match(a.file,/rich-captures/);assert.equal(fs.statSync(a.file).mode&0o777,0o600);assert.equal(b.sessions.size,0);}
 }finally{await b.close();fs.rmSync(state,{recursive:true,force:true});}
});
