import {metadataTargetValid,isMetadataOperation} from './native-metadata-control.mjs'
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys
// Admission-time observation, not an atomic native API epoch precondition.
export function nativeMetadataTargetObservation({request,pointer,policy,peer,process:observed,now=Date.now()}={}){
 if(request?.ops?.some(o=>o.op==='set_session_model')&&policy?.metadataModelControl!==true)return null
 const nativeSend=request?.ops?.[0]?.op==='send_message'&&policy?.metadataSendControl===true
 const binding=request?.nativeMetadataTargetBinding,t=binding&&Object.fromEntries(['sessionId','cwd','pid','procStart'].map(k=>[k,binding[k]]))
 if(policy?.nativeMetadataTargetVersion!==1||!exact(policy.metadataTarget,'cwd,pid,procStart,sessionId')||!['sessionId','cwd','pid','procStart'].every(k=>policy.metadataTarget[k]===t?.[k])||!exact(binding,'cwd,pid,procStart,sessionId,version')||binding.version!==1||!metadataTargetValid(t,pointer?.serviceStateBinding)||t.pid===pointer.pid||!Array.isArray(request.ops)||request.ops.length!==1||!(isMetadataOperation(request.ops[0].op)||nativeSend)||request.ops[0].args?.session_id!==t.sessionId||!Number.isSafeInteger(now)||now>=request.expiresAt)return null
 if(peer?.pid!==t.pid||peer.procStart!==t.procStart||peer.hostSessionId!==t.sessionId||peer.sessionId!==t.sessionId.slice(6)||peer.cwd!==t.cwd||peer.version!=='2.1.299'||peer.entrypoint!=='claude-desktop'||!(nativeSend?['idle','working','busy','running'].includes(peer.status):peer.status==='idle')||peer.spare||peer.parkedJobId||observed?.pid!==t.pid||observed.procStart!==t.procStart)return null
 return {version:1,...t,observedAt:now}
}
export function nativeMetadataTargetEvidenceMatches(request,admission){
 const b=request?.nativeMetadataTargetBinding,o=admission?.metadataTarget
 return !!(exact(b,'cwd,pid,procStart,sessionId,version')&&b.version===1&&exact(o,'cwd,observedAt,pid,procStart,sessionId,version')&&['version','sessionId','cwd','pid','procStart'].every(k=>b[k]===o[k])&&Number.isSafeInteger(o.observedAt)&&o.observedAt>=Date.parse(request.createdAt)&&o.observedAt<=admission.at&&admission.at<request.expiresAt)
}
