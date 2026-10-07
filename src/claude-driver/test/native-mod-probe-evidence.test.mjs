import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {mkdtempSync,writeFileSync,symlinkSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {MOD_PROBE as p,readProbeBytes,probePathPresence,screenProbeReport,screenProbeState} from '../lib/native-mod-probe-evidence.mjs'
const now=p.notBefore+60000
function evidence(changes={},intentChanges={}){
 const startedAt=new Date(p.notBefore+1000).toISOString()
 const report={schemaVersion:1,scope:'owned-native-mod-read-probe',probeId:p.id,pluginVersion:p.version,brokerSession:p.brokerSession,brokerCwd:p.brokerCwd,targetSession:p.targetSession,startedAt,complete:true,nativeCallReturned:false,resultWasError:null,gateQualified:false,releaseAuthorized:false,modelCallsRequested:0,nativeModelTurnsQualified:false,completedAt:new Date(p.notBefore+2000).toISOString(),...changes}
 const intent={schemaVersion:1,scope:'owned-native-mod-read-probe-intent',probeId:p.id,pluginVersion:p.version,brokerSession:p.brokerSession,targetSession:p.targetSession,startedAt,complete:false,gateQualified:false,releaseAuthorized:false,...intentChanges}
 const bytes=Buffer.from(JSON.stringify(report)),sha256=createHash('sha256').update(bytes).digest('hex')
 return {bytes,opts:{sha256,intent,now}}
}
test('scoped negative/success/error reports remain assertions with all qualification gates false',()=>{
 for(const change of [{},{nativeCallReturned:true,resultWasError:false},{nativeCallReturned:true,resultWasError:true}]){
  const {bytes,opts}=evidence(change),r=screenProbeReport(bytes,opts)
  assert.equal(r.reportConsistent,true);assert.equal(r.gateQualified,false);assert.equal(r.releaseAuthorized,false);assert.equal(r.reported.nativeCallReturned,change.nativeCallReturned??false)
 }
})
test('untrusted extra instructions, metadata, claimed qualification and wrong scopes are rejected without leaking values',()=>{
 for(const change of [{instructions:'synthetic private command'},{rawResult:'synthetic private metadata'},{gateQualified:true},{releaseAuthorized:true},{nativeModelTurnsQualified:true},{brokerSession:'foreign'},{targetSession:'foreign'},{scope:'foreign'},{complete:false},{nativeCallReturned:'false'},{modelCallsRequested:1},{resultWasError:false}]){
  const {bytes,opts}=evidence(change),r=screenProbeReport(bytes,opts)
  assert.equal(r.reportConsistent,false);assert.ok(!JSON.stringify(r).includes('private'));assert.equal(r.releaseAuthorized,false)
 }
})
test('scanner hash, pending intent identity and original time bounds are mandatory',()=>{
 const original=evidence()
 assert.equal(screenProbeReport(original.bytes,{...original.opts,sha256:'0'.repeat(64)}).reportConsistent,false)
 for(const change of [{probeId:'foreign'},{startedAt:new Date(p.notBefore+5000).toISOString()},{complete:true},{instructions:'synthetic private command'}]){const {bytes,opts}=evidence({},change);assert.equal(screenProbeReport(bytes,opts).reportConsistent,false)}
 for(const change of [{startedAt:new Date(p.notBefore-1).toISOString()},{startedAt:new Date(now+1).toISOString()},{completedAt:new Date(now+1).toISOString()},{completedAt:new Date(p.notBefore).toISOString()},{startedAt:'2026-02-30T00:00:00.000Z'}]){const {bytes,opts}=evidence(change);assert.equal(screenProbeReport(bytes,opts).reportConsistent,false)}
})
test('partial or oversized JSON refuses; unknown completion time is kept unknown',()=>{
 assert.equal(screenProbeReport(Buffer.from('{'),evidence().opts).reportConsistent,false)
 assert.equal(screenProbeReport(Buffer.alloc(4097),evidence().opts).reportConsistent,false)
 const x=evidence(),report=JSON.parse(x.bytes);delete report.completedAt;const bytes=Buffer.from(JSON.stringify(report)),r=screenProbeReport(bytes,{...x.opts,sha256:createHash('sha256').update(bytes).digest('hex')})
 assert.equal(r.reportConsistent,true);assert.equal(r.reported.completedAt,null)
})
function state(){return {report:{reportConsistent:true},versions:{app:'2.26454.0',cli:'2.1.289'},broker:{sessionId:p.brokerSession,live:{pid:p.pid,procStart:p.procStart,entrypoint:'claude-desktop'},runtime:{pinned:true,integrity:true,build:p.brokerBuild}},settingsHash:p.settingsHash,policyHash:p.policyHash,sourceFiles:p.files,installedFiles:p.files,stopped:false,armed:false,diagnostic:false}}
test('all current host checks only permit independent review, never native qualification',()=>{
 const r=screenProbeState(state());assert.equal(r.eligibleForNativeReview,true)
 for(const gate of ['pluginLoadedQualified','nativeEpochKernelQualified','nativeGateQualified','nativeModelTurnsQualified','scopedUnloadQualified','releaseAuthorized'])assert.equal(r[gate],false)
})
test('changed epoch, app, handler, copied bytes and pending control each refuse review eligibility',()=>{
 for(const change of [{versions:{app:'updated',cli:'2.1.289'}},{broker:{...state().broker,live:{...state().broker.live,pid:p.pid+1}}},{broker:{...state().broker,runtime:{...state().broker.runtime,integrity:false}}},{settingsHash:'changed'},{policyHash:'changed'},{sourceFiles:{}},{installedFiles:{}},{stopped:true},{armed:true},{diagnostic:true},{stopped:null},{armed:null},{diagnostic:null},{report:{reportConsistent:false}}])assert.equal(screenProbeState({...state(),...change}).eligibleForNativeReview,false)
})
test('bounded evidence reader refuses symlinks, directories and oversized files with fixed errors',()=>{
 const root=mkdtempSync(join(tmpdir(),'native-mod-evidence-'))
 try{
  const file=join(root,'report'),link=join(root,'link');writeFileSync(file,'synthetic private content');symlinkSync(file,link)
  assert.equal(readProbeBytes(file).bytes.toString(),'synthetic private content')
  assert.equal(probePathPresence(file),true);assert.equal(probePathPresence(link),true);assert.equal(probePathPresence(join(root,'missing')),false);assert.equal(probePathPresence(null),null)
  for(const [path,bound] of [[link,16384],[root,16384],[file,1]])assert.throws(()=>readProbeBytes(path,bound),e=>!e.message.includes('private')&&e.message==='probe evidence is unavailable, oversized or changed')
  for(const bound of [0,NaN,Infinity,65537,1.5])assert.throws(()=>readProbeBytes(file,bound),/probe evidence is unavailable/)
 }finally{rmSync(root,{recursive:true,force:true})}
})
