import {join} from 'node:path'
import {lstatSync} from 'node:fs'
import {STATE_DIR} from './state.mjs'
import {readReceiverFile} from './receiver-runtime-selection.mjs'
const job=/^j[a-f0-9]{32}$/
export function validateImportContinuation(original,worker,attempt,{session,serviceId,target,targetServiceId,familyRequestId,originalJobId}){
 const wake=original?.children?.wake,ref='rpeer'+wake?.jobId?.slice(1)
 if(!job.test(originalJobId||'')||original?.jobId!==originalJobId||worker?.id!==originalJobId||worker.state!=='failed'||original.phase!=='before-wake'||!original.failure||original.cycle!==false||original.session!==session||original.serviceId!==serviceId||original.target!==target||original.targetServiceId!==targetServiceId||original.children?.family||original.children?.prepare||original.children?.activate||!job.test(wake?.jobId||'')||wake.observation?.state!=='failed'||wake.observation.error?.category!=='independent_service_read_refused'||wake.submission?.arguments?.family_request_id!==familyRequestId||attempt?.requestId!==ref||attempt.session!==session||attempt.serviceId!==serviceId||attempt.targetSession!==target||attempt.operation!=='send_message'||attempt.wakeControl?.serviceId!==targetServiceId||attempt.wakeControl.familyRequestId!==familyRequestId||attempt.state!=='unresolved'||attempt.error?.requestId!==null||attempt.error.phase!=='prepare'||attempt.error.retrySafe!==true||attempt.error.cleanupPending!==false)throw Error('original import continuation boundary unqualified')
 for(const [stage,key]of [['quiesce','quiescent'],['retire','filesRetired'],['unarchive','unarchived']]){const c=original.children?.[stage];if(!job.test(c?.jobId||'')||c.observation?.state!=='completed'||c.observation.result?.[key]!==true)throw Error('original completed import stages required')}
 if(original.children.unarchive.observation.args?.import_only!==true||original.children.unarchive.observation.args.session!==target||original.children.unarchive.observation.result.sessionId!==target)throw Error('original exact import required')
 return {originalJobId,wakeRequestId:ref,unarchive:original.children.unarchive.observation}
}
export function readImportContinuation(originalJobId,scope){
 if(!job.test(originalJobId||''))throw Error('original recovery child required')
 const read=(dir,id)=>JSON.parse(readReceiverFile(join(STATE_DIR,dir,id+'.json'),1048576)),original=read('independent-service-recoveries',originalJobId),worker=read('jobs',originalJobId),wake=original.children?.wake
 if(!job.test(wake?.jobId||''))throw Error('original wake child required')
 for(const stage of ['quiesce','retire','unarchive','wake']){const c=original.children[stage],actual=read('jobs',c.jobId);if(actual.id!==c.jobId||actual.state!==c.observation.state||JSON.stringify(actual.result)!==JSON.stringify(c.observation.result)||JSON.stringify(actual.args)!==JSON.stringify(c.observation.args))throw Error('original child job evidence changed')}
 const ref='rpeer'+wake.jobId.slice(1),attempt=read('independent-service-jobs',ref),proof=validateImportContinuation(original,worker,attempt,{...scope,originalJobId}),r=original.children.retire.observation.result
 // The worker explicitly stopped before enqueue; independently require no
 // publication, invocation, response or reserved request in the sealed actor.
 const actor=scope.actorCwd,root=join(actor,'.claude-driver-services',scope.serviceId),broker=join(root,'broker')
 const absent=p=>{try{lstatSync(p);throw Error('original wake publication exists')}catch(e){if(e.code!=='ENOENT')throw e}}
 for(const p of [join(broker,'requests',ref+'.json'),join(broker,'controls',ref+'.json'),join(broker,'results',ref+'.json'),join(broker,'results',ref+'.native.json'),join(broker,'.native-service-'+ref+'.intent.json'),join(broker,'.native-service-'+ref+'.result.json'),join(broker,'native-service-send-'+ref+'.json')])absent(p)
 if(r.serviceId!==scope.targetServiceId||r.sessionId!==scope.target)throw Error('original retirement identity changed')
 return {...proof,original}
}
