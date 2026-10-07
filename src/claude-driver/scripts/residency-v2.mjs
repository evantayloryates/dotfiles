#!/usr/bin/env node
// Observe the owned broker and natural native governor pressure. Never send,
// navigate, restart, manufacture OS pressure, or touch another session.
import assert from 'node:assert/strict'
import {join} from 'node:path'
import {brokerInfo,protocolVersion} from '../lib/broker.mjs'
import {getRecord} from '../lib/sessions.mjs'
import {validateWarmBroker} from '../lib/warm-recovery.mjs'
import {assertInputHealthy} from '../lib/input-health.mjs'
import {uiPolicy} from '../lib/ui-policy.mjs'
import {logSince} from '../lib/focus.mjs'
import {BROKER_DIR,STATE_DIR,writeJsonAtomic} from '../lib/state.mjs'
import {runtimeFingerprint} from '../lib/build.mjs'
import {recordMemory} from '../lib/memory.mjs'
import {sleep} from '../lib/paths.mjs'
if(!process.argv.includes('--live'))throw Error('explicit --live required for native observation')
const flag=(name,fallback)=>{const i=process.argv.indexOf('--'+name);return i<0?fallback:Number(process.argv[i+1])}
const duration=flag('duration-sec',480),wait=flag('wait-sec',0)
if(!Number.isInteger(duration)||duration<180||duration>1800||!Number.isInteger(wait)||wait<0||wait>1800)throw Error('duration must be 180–1800 seconds; wait 0–1800')
const stamp=new Date().toISOString().replace(/[:.]/g,'-'),rows=[],samples=[],sourceBefore=runtimeFingerprint(),events=new Set()
let aborted=false
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{aborted=true})
const check=()=>{if(aborted)throw Error('observer cancelled');assert.equal(runtimeFingerprint(),sourceBefore,'source changed');assert.equal(uiPolicy().blocked,true,'input quarantine must remain active')}
async function step(name,fn){const at=Date.now();try{const evidence=await fn();rows.push({name,ok:true,ms:Date.now()-at,evidence});console.log(JSON.stringify(rows.at(-1)));return evidence}catch(e){rows.push({name,ok:false,ms:Date.now()-at,error:e.message,category:e.category});throw e}}
try{
 check();const b=brokerInfo();validateWarmBroker(b,getRecord(b.sessionId),BROKER_DIR);assert.equal(protocolVersion(),'7')
 await step('input-audit-before',async()=>{const r=await assertInputHealthy({phase:'before-native-residency',evidence:join(STATE_DIR,'pressure',`residency-${stamp}-before.json`)});return {filters:r.filters.length,inputAutomation:false}})
 const initial=await step('native-maintenance-job-acknowledged',async()=>{
  const end=Date.now()+wait*1000
  do{check();const b=brokerInfo();if(b.live&&b.templateCurrent&&b.residencyProtection.verified)return {sessionId:b.sessionId,pid:b.live.pid,protection:b.residencyProtection};if(Date.now()>=end)throw Error('no current live broker with correlated native CronList/create receipt and app acknowledgment');await sleep(2000)}while(true)
 })
 await step('same-broker-survives-native-idle',async()=>{
  const start=Date.now(),end=start+duration*1000
  do{
   check();const b=brokerInfo();assert.equal(b.live?.pid,initial.pid,'broker process changed or was evicted');assert.equal(b.templateCurrent,true);assert.equal(b.residencyProtection.verified,true,'current native maintenance evidence must remain verified')
   const eviction=logSince(start,new RegExp(`pressure evicting ${initial.sessionId}|Pausing session ${initial.sessionId} \\(governor_evict\\)`))
   assert.equal(eviction.length,0,'native governor evicted the owned broker')
   for(const line of logSince(start,/\[CliGovernor\].*(pressure|sweep)/))events.add(line)
   samples.push({at:new Date().toISOString(),pid:b.live.pid,resident:b.resident.resident,protectionFresh:b.residencyProtection.verified})
   if(Date.now()>=end)break
   await sleep(Math.min(15000,end-Date.now()))
  }while(true)
  return {seconds:(Date.now()-start)/1000,samePid:true,pressureEvents:events.size,nativeWrites:0,navigation:false,inputAutomation:false}
 })
 await step('natural-governor-pressure-observed',async()=>{assert.ok(events.size>0,'idle survival observed, but no natural governor pressure; pressure qualification remains incomplete');return {pressureEvents:events.size}})
}catch(e){process.exitCode=1;console.log(JSON.stringify({failure:e.category||e.message}))}
finally{
 await step('input-audit-after',async()=>{const r=await assertInputHealthy({phase:'after-native-residency',evidence:join(STATE_DIR,'pressure',`residency-${stamp}-after.json`)});return {filters:r.filters.length,uiQuarantine:uiPolicy().blocked}}).catch(()=>{process.exitCode=1})
 const sourceAfter=runtimeFingerprint(),required=['input-audit-before','native-maintenance-job-acknowledged','same-broker-survives-native-idle','natural-governor-pressure-observed','input-audit-after']
 const ok=!aborted&&sourceBefore===sourceAfter&&required.every(name=>rows.some(r=>r.name===name&&r.ok)),report=join(STATE_DIR,'pressure',`residency-v2-${stamp}.json`)
 writeJsonAtomic(report,{scope:'native-broker-idle-residency',ok,sourceBefore,sourceAfter,rows,samples,required,pressureEvents:events.size,aborted})
 recordMemory({kind:'test_result',topic:'broker-native-residency',source:'residency-v2',status:ok?'passed':'failed',evidence:report,lesson:`${rows.filter(r=>r.ok).length}/${required.length} checks; natural pressure events=${events.size}; no native writes/navigation/input; sourceUnchanged=${sourceBefore===sourceAfter}`})
 console.log(JSON.stringify({report,ok}));if(!ok)process.exitCode=1
}
