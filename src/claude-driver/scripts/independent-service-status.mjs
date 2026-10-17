#!/usr/bin/env node
import {readdirSync} from 'node:fs'
import {join} from 'node:path'
import {BROKER_DIR,STATE_DIR} from '../lib/state.mjs'
import {loadIndependentServiceContext,independentJson} from '../lib/independent-service-context.mjs'
import {summarizeIndependentBudget,summarizeIndependentActivationLedger} from '../lib/independent-service-status.mjs'
import {reviewIndependentAttempts} from '../lib/independent-service-attempts.mjs'
import {screenNativeServiceReady} from '../lib/native-peer-service-evidence.mjs'
const [session,serviceId]=process.argv.slice(2)
let activation={activationPhaseObserved:null,activationEffectsAssessed:false}
try{
 let ledger=null;try{ledger=independentJson(join(STATE_DIR,'activation.json'))}catch(error){if(error.code!=='ENOENT')throw error}
 activation=summarizeIndependentActivationLedger(ledger,{serviceId,session})
 const c=await loadIndependentServiceContext(session,serviceId),now=Date.now(),{config,pointer,policy}=c
 const slots=Array.from({length:config.maxRequests},(_,slot)=>{try{return c.read('../native-service-budget-'+serviceId+'-'+slot+'.json')}catch(e){if(e.code!=='ENOENT')throw e;return null}}),budget=summarizeIndependentBudget(config,slots)
 const allNames=readdirSync(BROKER_DIR),attempts=reviewIndependentAttempts({context:c,reservedRequestIds:budget.reservedRequestIds,names:allNames,now})
 const names=allNames.filter(n=>/^native-policy-invocation-[A-Za-z0-9_-]+\.json$/.test(n));if(names.length>128)throw Error('audit bound')
 const nativePolicyObserved=names.some(name=>{const a=c.read(name);return a.scope==='owned-native-policy-invocation'&&a.pid===pointer.pid&&a.procStart===pointer.procStart&&a.sessionId===session&&a.build===pointer.build&&a.generation===pointer.generation&&a.handlerSha256===policy.sha256&&a.settingsHash===policy.settingsHash&&Number.isFinite(a.at)&&a.at>=config.notBefore&&a.at>=Date.parse(pointer.activatedAt)&&a.at<=now})
 let readinessObserved=false
 try{readinessObserved=screenNativeServiceReady({config,ready:c.read('.native-service-'+serviceId+'.ready.json'),now:Math.min(now,config.deadline)})}catch(error){if(error.code!=='ENOENT')throw error}
 console.log(JSON.stringify({serviceId,sessionId:session,...activation,nativeInputRequired:c.peer.status==='waiting',verified:true,build:pointer.build,generation:pointer.generation,nativeEpoch:{pid:pointer.pid,procStart:pointer.procStart,status:c.peer.status},deadline:config.deadline,expired:now>config.deadline,readinessObserved,nativePolicyObserved,...budget,...attempts,servingQualified:false,recoveryAttempted:false}))
}catch{console.log(JSON.stringify({serviceId,sessionId:session,...activation,verified:false,servingQualified:false,recoveryAttempted:false,reason:'independent-service-context-unqualified'}))}
