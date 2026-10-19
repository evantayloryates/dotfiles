import {join} from 'node:path'
import {inspectIndependentService} from '../lib/independent-service-result.mjs'
import {independentResidencySample} from '../lib/independent-residency.mjs'
import {assertInputHealthy} from '../lib/input-health.mjs'
import {uiPolicy} from '../lib/ui-policy.mjs'
import {logSince} from '../lib/focus.mjs'
import {STATE_DIR,writeJsonAtomic} from '../lib/state.mjs'
import {runtimeFingerprint} from '../lib/build.mjs'
import {recordMemory} from '../lib/memory.mjs'
import {sleep} from '../lib/paths.mjs'
export async function observeIndependentResidency(session,serviceId,duration){
 if(!/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(session||'')||! /^[a-f0-9]{32}$/.test(serviceId||'')||!Number.isInteger(duration)||duration<180||duration>1800)throw Error('exact owned controller and 180–1800 seconds required')
 const stamp=new Date().toISOString().replace(/[:.]/g,'-'),report=join(STATE_DIR,'pressure','independent-residency-'+stamp+'.json'),sourceBefore=runtimeFingerprint(),samples=[],pressure=new Set(),start=Date.now(),end=start+duration*1000;let aborted=false,error=null,idleSurvivalVerified=false
 const abort=()=>{aborted=true};process.once('SIGTERM',abort);process.once('SIGINT',abort)
 try{
  if(!uiPolicy().blocked)throw Error('input quarantine must remain active')
  await assertInputHealthy({phase:'before-independent-idle',evidence:report+'.before.json'})
  let initial
  do{
   if(aborted||runtimeFingerprint()!==sourceBefore||!uiPolicy().blocked)throw Error('observer cancelled or source/quarantine changed')
   const s=await inspectIndependentService(session,serviceId),sample=independentResidencySample(s,initial,{now:Date.now(),remainingMs:Math.max(0,end-Date.now())});initial??=sample;samples.push(sample)
   if(logSince(start,new RegExp(`pressure evicting ${session}|Pausing session ${session} \\(governor_evict\\)`)).length)throw Error('owned controller native governor eviction observed')
   for(const line of logSince(start,/\[CliGovernor\].*(pressure|sweep)/))pressure.add(line)
   console.log(JSON.stringify({sample:samples.length,pid:sample.pid,status:sample.status,elapsedSec:Math.round((Date.now()-start)/1000),pressureEvents:pressure.size,nativeWrites:0}))
   if(Date.now()>=end){idleSurvivalVerified=true;break}
   await sleep(Math.min(15000,end-Date.now()))
  }while(true)
 }catch(e){error=e.message}
 finally{
  try{await assertInputHealthy({phase:'after-independent-idle',evidence:report+'.after.json'})}catch(e){error??=e.message}
  process.removeListener('SIGTERM',abort);process.removeListener('SIGINT',abort)
  const sourceAfter=runtimeFingerprint(),pressureQualified=idleSurvivalVerified&&pressure.size>0,ok=!error&&!aborted&&sourceBefore===sourceAfter&&pressureQualified
  writeJsonAtomic(report,{scope:'independent-native-idle-residency',session,serviceId,duration,samples,sourceBefore,sourceAfter,idleSurvivalVerified,pressureQualified,pressureEvents:pressure.size,error,aborted,ok,nativeWrites:0,navigation:false,inputAutomation:false,recoveryAttempted:false,cronProtectionAssessed:false})
  recordMemory({kind:'test_result',topic:'independent-native-idle-residency',source:'residency-v2',status:ok?'passed':error?'failed':'unqualified',evidence:report,lesson:`Idle survival=${idleSurvivalVerified}; natural pressure qualified=${pressureQualified}; no native writes/navigation/recovery; sourceUnchanged=${sourceBefore===sourceAfter}`})
  console.log(JSON.stringify({report,idleSurvivalVerified,pressureQualified,pressureEvents:pressure.size,error,ok,nativeWrites:0}));if(!ok)process.exitCode=1
 }
}
