#!/usr/bin/env node
import {writeFileSync,readdirSync,lstatSync} from 'node:fs'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {STATE_DIR,BROKER_DIR,withLock,writeJsonAtomic} from '../lib/state.mjs'
import {loadIndependentServiceContext,independentJson as json,independentBytes as bytes,independentOrdered as ordered} from '../lib/independent-service-context.mjs'
import {independentStopMatches} from '../lib/independent-service-quiesce.mjs'
import {snapshotIndependentModule} from '../lib/independent-module-tree.mjs'
import {summarizeIndependentBudget} from '../lib/independent-service-status.mjs'
import {reviewIndependentAttempts} from '../lib/independent-service-attempts.mjs'
import {publishNativeServiceDirectory} from '../lib/native-service-enroll.mjs'
const [session,serviceId,mode]=process.argv.slice(2),file=join(STATE_DIR,'retirement.json'),dest=join(STATE_DIR,'retired-module'),hash=b=>createHash('sha256').update(b).digest('hex'),same=(a,b)=>JSON.stringify(ordered(a))===JSON.stringify(ordered(b))
const present=p=>{try{lstatSync(p);return true}catch(e){if(e.code==='ENOENT')return false;throw e}}
try{
 const retireSettings=mode==='--settings'
 const result=await withLock('broker',async()=>{
  const guard=async()=>{
   const c=await loadIndependentServiceContext(session,serviceId,{requireIdle:true,allowRetired:true}),q=json(join(STATE_DIR,'quiescence.json')),stop=json(join(BROKER_DIR,'STOP'))
   if(q.serviceId!==serviceId||q.sessionId!==session||q.phase!=='quiescent'||!independentStopMatches(stop,{serviceId,pointer:c.pointer})||q.stopSha256!==hash(bytes(join(BROKER_DIR,'STOP'))))throw Error('not quiesced')
   const slots=Array.from({length:c.config.maxRequests},(_,slot)=>{try{return c.read('../native-service-budget-'+serviceId+'-'+slot+'.json')}catch(e){if(e.code!=='ENOENT')throw e;return null}}),budget=summarizeIndependentBudget(c.config,slots),attempts=reviewIndependentAttempts({context:c,reservedRequestIds:budget.reservedRequestIds,names:readdirSync(BROKER_DIR)})
   if(!attempts.terminalAttemptReviewComplete)throw Error('unresolved attempts');return {c,attempts}
  }
  const {c,attempts}=await guard()
  if(c.sourceDisposition==='installed'){
   if(present(file)||present(dest))throw Error('retirement already started')
   const inventory=snapshotIndependentModule(c.module,c.pkg.hashes),ledger={schemaVersion:1,kind:'independent-service-retirement',serviceId,...Object.fromEntries(['sessionId','build','generation','pid','procStart'].map(k=>[k,c.pointer[k]])),phase:'before-move',at:Date.now(),inventory,auxiliaryContentsQualified:false,nativeUnloadQualified:false,processRetired:false}
   writeFileSync(file,JSON.stringify(ledger),{flag:'wx',mode:0o600});await guard()
   if(!same(snapshotIndependentModule(c.module,c.pkg.hashes),inventory))throw Error('module changed')
   publishNativeServiceDirectory(c.module,dest)
   if(present(c.watchedModule)||!same(snapshotIndependentModule(dest,c.pkg.hashes),inventory))throw Error('move uncertain')
   writeJsonAtomic(file,{...ledger,phase:'files-retired',retiredAt:Date.now()})
  }
  let retainedSettingsFile
  if(retireSettings){
   const verified=await guard(),c=verified.c,retained=join(STATE_DIR,'retired-settings.json'),ledger=json(file),settings=c.policy.settingsPath
   if(c.sourceDisposition!=='files-retired'||!settings)throw Error('settings retirement requires retired module')
   if(present(retained)){if(!['before-move','retained'].includes(ledger.settingsPhase)||ledger.settingsSha256!==c.policy.settingsHash||hash(bytes(retained))!==c.policy.settingsHash)throw Error('retained settings drift');if(ledger.settingsPhase==='before-move')writeJsonAtomic(file,{...ledger,settingsPhase:'retained',settingsRetiredAt:Date.now()})}
   else{
    if(hash(bytes(settings))!==c.policy.settingsHash)throw Error('settings changed')
    writeJsonAtomic(file,{...ledger,settingsPhase:'before-move',settingsSha256:c.policy.settingsHash})
    publishNativeServiceDirectory(settings,retained)
    if(hash(bytes(retained))!==c.policy.settingsHash)throw Error('settings move uncertain')
    writeJsonAtomic(file,{...ledger,settingsPhase:'retained',settingsSha256:c.policy.settingsHash,settingsRetiredAt:Date.now()})
   }
   retainedSettingsFile=retained
  }
  const reviewed=await guard();if(reviewed.c.sourceDisposition!=='files-retired')throw Error('retirement checkpoint incomplete')
  return {serviceId,sessionId:session,filesRetired:true,registrationBytesPreserved:true,auxiliaryBytesPreserved:true,settingsPreserved:true,...retainedSettingsFile?{ownedSettingsRetired:true,retainedSettingsFile}:{},stopPreserved:true,terminalAttemptReviewComplete:true,attemptsReviewed:attempts.attemptsReviewed,retiredDirectory:dest,nativeUnloadQualified:false,processRetired:false,automaticResume:false}
 },{timeoutMs:60000})
 console.log(JSON.stringify(result))
}catch{console.error('independent retirement refused; preserve module bytes, STOP and original retirement record');process.exitCode=1}
