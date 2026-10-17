#!/usr/bin/env node
import {existsSync,lstatSync,writeFileSync,readdirSync} from 'node:fs'
import {join} from 'node:path'
import {BROKER_DIR,STATE_DIR,withLock} from '../lib/state.mjs'
import {loadIndependentServiceContext,independentJson} from '../lib/independent-service-context.mjs'
import {settleIndependentServiceResult} from '../lib/independent-service-settlement.mjs'
import {runNativeServiceReadTransaction,publishNativeServiceReadRequest} from '../lib/native-service-read.mjs'
import {pickupPending,cancelRequest} from '../lib/requests.mjs'
import {observeNativeReceipts} from '../lib/native-receipts.mjs'
import {screenNativeServiceReady} from '../lib/native-peer-service-evidence.mjs'
import {deliver} from '../lib/peer-direct.mjs'
import {getRecord,readPins,openPrs} from '../lib/sessions.mjs'
import {peerRecord} from '../lib/peer-direct.mjs'
import {inspectIndependentService} from '../lib/independent-service-result.mjs'
import {readReceiverFile} from '../lib/receiver-runtime-selection.mjs'
import {parseNativeFamilyMetadata} from '../lib/native-family-preflight.mjs'
import {archiveControlArguments} from '../lib/native-archive-control.mjs'
import {inspectNativeResourcePid} from '../lib/native-resource-process.mjs'
import {NATIVE_FAMILY_QUERY} from '../lib/native-family-preflight.mjs'
import {sleep} from '../lib/paths.mjs'
const controller=new AbortController()
process.on('SIGTERM',()=>controller.abort())
process.on('SIGINT',()=>controller.abort())
let requestId
try{
 const [session,serviceId,target,id,timeout,mode,targetServiceId,familyRequestId]=process.argv.slice(2),timeoutMs=Number(timeout),family=mode==='--family',archive=mode==='--archive';requestId=id
 if(mode!==undefined&&!family&&!archive||process.argv.slice(2).length>(archive?8:family?6:5)||archive&&(!/^[a-f0-9]{32}$/.test(targetServiceId||'')||!/^rpeer[a-f0-9]{32}$/.test(familyRequestId||'')))throw Error('mode')
 if(!/^rpeer[a-f0-9]{32}$/.test(id||'')||!/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(target||'')||(family?target!==session:target===session)||!getRecord(target)||!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>60000)throw Error('arguments')
 const result=await withLock('broker',async()=>{
  let context,request
  const preflight=async()=>{
   context=await loadIndependentServiceContext(session,serviceId,{requireIdle:true})
   const {config,pointer,policy}=context,now=Date.now()
   if(!screenNativeServiceReady({config,ready:context.read('.native-service-'+serviceId+'.ready.json'),now})||config.deadline-now<1000)throw Error('readiness')
   for(const name of ['STOP','stop-rescue-arm.json','mechanical-probe.json']){try{lstatSync(join(BROKER_DIR,name));throw Error('control present')}catch(e){if(e.code!=='ENOENT')throw e}}
   const names=readdirSync(BROKER_DIR).filter(n=>/^native-policy-invocation-[A-Za-z0-9_-]+\.json$/.test(n));if(names.length>128)throw Error('audit bound')
   const qualified=names.some(name=>{const a=context.read(name);return a.scope==='owned-native-policy-invocation'&&a.tool==='Bash'&&a.pid===pointer.pid&&a.procStart===pointer.procStart&&a.sessionId===session&&a.build===pointer.build&&a.generation===pointer.generation&&a.handlerSha256===policy.sha256&&a.settingsHash===policy.settingsHash&&Number.isFinite(a.at)&&a.at>=Date.parse(pointer.activatedAt)&&a.at>=config.notBefore&&a.at<=now})
   if(!qualified)throw Error('native policy not observed')
   if(archive){
    const t=config.archiveTarget,r=getRecord(target),p=peerRecord(target),h=await inspectIndependentService(target,targetServiceId,{historical:true})
    if(!t||t.sessionId!==target||!r||r.isArchived||r.cwd!==t.cwd||r.worktreePath||readPins().has(target)||openPrs(r).length||!p||p.pid!==t.pid||p.procStart!==t.procStart||p.status!=='idle'||!h.verified||h.verificationMode!=='historical-retired'||h.sourceDisposition!=='files-retired'||!h.admissionStopped||!h.stopMarkerMatchesGeneration||!h.terminalAttemptReviewComplete||h.unresolvedRequestIds.length||h.nativeEpoch.pid!==t.pid||h.nativeEpoch.procStart!==t.procStart||!h.settledRequestIds.includes(familyRequestId))throw Error('archive target unqualified')
    const file=join(t.cwd,'.claude-driver-services',targetServiceId,'broker','results',familyRequestId+'.native.json'),receipt=JSON.parse(readReceiverFile(file,65536)),rows=receipt.results?.length===1&&receipt.results[0].op==='list_sessions'&&receipt.results[0].ok===true?parseNativeFamilyMetadata(receipt.results[0].result,target):null
    if(receipt.id!==familyRequestId||receipt.source!=='native-peer-service-result'||rows===null||rows.length!==0)throw Error('archive family scope unqualified')
   }
  }
  return runNativeServiceReadTransaction({requestId:id,signal:controller.signal},{
   prepare:async()=>{await preflight();const {config,pointer,policy}=context;request={id,protocol:7,createdAt:new Date().toISOString(),expiresAt:Math.min(Date.now()+timeoutMs,config.deadline),ops:[archive?{op:'archive_session',args:archiveControlArguments(config.archiveTarget)}:family?{op:'list_sessions',args:{...NATIVE_FAMILY_QUERY}}:{op:'get_session',args:{session_id:target}}],nativeEffectAdmissionPolicy:{version:1,handlerSha256:policy.sha256,settingsHash:policy.settingsHash},nativeRuntimeBinding:{version:1,...Object.fromEntries(['build','bootstrapHash','generation','sessionId','pid','procStart'].map(k=>[k,pointer[k]]))}};const observe=observeNativeReceipts(session,request);if(!observe)throw Error('journal');request.nativeObservation=observe.start;return {request}},
   enqueue:r=>publishNativeServiceReadRequest({dir:STATE_DIR,serviceId,maxRequests:context.config.maxRequests,request:r}),claim:id=>pickupPending({requestId:id}),revalidate:preflight,
   send:()=>deliver({sessionId:session,permissionMode:'bypassPermissions',live:{pid:context.peer.pid,procStart:context.peer.procStart,status:context.peer.status}},context.config.token+' '+id,{signal:controller.signal,timeoutMs:Math.min(5000,timeoutMs),onPrepared:meta=>writeFileSync(join(BROKER_DIR,'native-service-send-'+id+'.json'),JSON.stringify({serviceId,requestId:id,...meta,at:Date.now(),retrySafe:false}),{flag:'wx',mode:0o600})}),
   now:Date.now,responsePresent:()=>existsSync(join(BROKER_DIR,'.native-service-'+id+'.result.json')),wait:()=>sleep(100),reconcile:async()=>{if(archive){while(Date.now()<request.expiresAt){if(controller.signal.aborted)throw Error('cancelled');const r=getRecord(target);if(r?.isArchived&&inspectNativeResourcePid(context.config.archiveTarget.pid)===null)break;await sleep(100)}}return settleIndependentServiceResult(session,serviceId,id)},cancel:cancelRequest,
  })
 },{timeoutMs:5000,signal:controller.signal})
 console.log(JSON.stringify({ok:true,result}))
}catch(error){console.log(JSON.stringify({ok:false,error:{requestId:error.requestId??null,phase:error.phase??'preflight',retrySafe:error.retrySafe??true,cleanupPending:error.cleanupPending??false}}))}
