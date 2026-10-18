#!/usr/bin/env node
import {readdirSync} from 'node:fs'
import {join} from 'node:path'
import {BROKER_DIR,STATE_DIR} from '../lib/state.mjs'
import {loadIndependentServiceContext,independentJson,independentBytes} from '../lib/independent-service-context.mjs'
import {summarizeIndependentBudget,summarizeIndependentActivationLedger} from '../lib/independent-service-status.mjs'
import {reviewIndependentAttempts} from '../lib/independent-service-attempts.mjs'
import {independentStopMatches} from '../lib/independent-service-quiesce.mjs'
import {observeNativeModLoading} from '../lib/native-mod-loading.mjs'
import {screenNativeServiceReady} from '../lib/native-peer-service-evidence.mjs'
import {requireIndependentEpochAbsent} from '../lib/independent-offline-review.mjs'
const [session,serviceId,mode,historicalCwd]=process.argv.slice(2),historicalOnly=mode==='--historical',offlineOnly=mode==='--offline'
let activation={activationPhaseObserved:null,activationEffectsAssessed:false}
try{
 if(mode!==undefined&&!historicalOnly&&!offlineOnly||historicalCwd!==undefined&&!historicalOnly&&!offlineOnly||process.argv.slice(2).length>4)throw Error('inspection mode')
 let ledger=null;try{ledger=independentJson(join(STATE_DIR,'activation.json'))}catch(error){if(error.code!=='ENOENT')throw error}
 activation=summarizeIndependentActivationLedger(ledger,{serviceId,session})
 const c=await loadIndependentServiceContext(session,serviceId,{allowRetired:!offlineOnly,historicalOnly,offlineOnly,...historicalCwd?{historicalRecord:{sessionId:session,cwd:historicalCwd}}:{}}),now=Date.now(),{config,pointer,policy}=c
 const slots=Array.from({length:config.maxRequests},(_,slot)=>{try{return c.read('../native-service-budget-'+serviceId+'-'+slot+'.json')}catch(e){if(e.code!=='ENOENT')throw e;return null}}),budget=summarizeIndependentBudget(config,slots)
 const allNames=readdirSync(BROKER_DIR),attempts=reviewIndependentAttempts({context:c,reservedRequestIds:budget.reservedRequestIds,names:allNames,now})
 const names=allNames.filter(n=>/^native-policy-invocation-[A-Za-z0-9_-]+\.json$/.test(n));if(names.length>128)throw Error('audit bound')
 const nativePolicyObserved=names.some(name=>{const a=c.read(name);return a.scope==='owned-native-policy-invocation'&&a.pid===pointer.pid&&a.procStart===pointer.procStart&&a.sessionId===session&&a.build===pointer.build&&a.generation===pointer.generation&&a.handlerSha256===policy.sha256&&a.settingsHash===policy.settingsHash&&Number.isFinite(a.at)&&a.at>=config.notBefore&&a.at>=Date.parse(pointer.activatedAt)&&a.at<=now})
 let readinessObserved=false
 try{readinessObserved=screenNativeServiceReady({config,ready:c.read('.native-service-'+serviceId+'.ready.json'),now:Math.min(now,config.deadline)})}catch(error){if(error.code!=='ENOENT')throw error}
 let admissionStopped=false,stopMarkerMatchesGeneration=false;try{const body=independentBytes(join(BROKER_DIR,'STOP'));admissionStopped=true;try{stopMarkerMatchesGeneration=independentStopMatches(JSON.parse(body),{serviceId,pointer})}catch{}}catch(error){if(error.code!=='ENOENT')throw error}
 let loading;try{loading=c.peer?observeNativeModLoading(c.peer,{now}):{loaderNotificationObserved:false,loaderOutcome:'not-assessed',consentAuthorized:false,generationReadinessAssessed:false}}catch{loading={loaderNotificationObserved:false,loaderOutcome:'unavailable',consentAuthorized:false,generationReadinessAssessed:false}}
 if(offlineOnly){requireIndependentEpochAbsent(pointer);const after=await loadIndependentServiceContext(session,serviceId,{offlineOnly:true,...historicalCwd?{historicalRecord:{sessionId:session,cwd:historicalCwd}}:{}});if(JSON.stringify(after.pointer)!==JSON.stringify(pointer))throw Error('offline inventory changed')}
 console.log(JSON.stringify({...config.sessionManagementControl?{sessionManagementControl:true}:{},...config.sessionMetadataControl?{sessionMetadataControl:true}:{},...config.sessionSendControl?{sessionSendControl:true}:{},serviceId,sessionId:session,...config.archiveTarget?{archiveTarget:config.archiveTarget}:{},...config.metadataTarget?{metadataTarget:config.metadataTarget}:{},...config.metadataModelControl?{metadataModelControl:true}:{},...config.metadataSendControl?{metadataSendControl:true}:{},...config.metadataStopControl?{metadataStopControl:true}:{},...activation,...loading,admissionStopped,stopMarkerMatchesGeneration,nativeInputRequired:c.peer?c.peer.status==='waiting':null,verified:true,verificationMode:c.verificationMode,nativeEpochAssessed:!historicalOnly&&!offlineOnly,...offlineOnly?{...c.offlineObservation,readinessIsHistorical:true,absenceCause:'unclassified'}:{},sourceDisposition:c.sourceDisposition,settingsEvidence:c.settingsEvidence,watchedPathAssessed:c.watchedPathAssessed,build:pointer.build,generation:pointer.generation,nativeEpoch:{pid:pointer.pid,procStart:pointer.procStart,status:c.peer?.status??'not-assessed'},deadline:config.deadline,expired:now>config.deadline,readinessObserved,nativePolicyObserved,...budget,...attempts,servingQualified:false,recoveryAttempted:false}))
}catch(error){const reason=['offline_epoch_identity_unavailable','offline_process_observation_unavailable','offline_predecessor_pid_present'].includes(error.category)?error.category:'independent-service-context-unqualified';console.log(JSON.stringify({serviceId,sessionId:session,...activation,verified:false,servingQualified:false,recoveryAttempted:false,reason}))}
