// Duplicate native slots need an indexed checkpoint from the actual deployed
// helper, not merely an index feature in newer host source.
import {DriverError} from './paths.mjs'
const ordered=x=>Array.isArray(x)?x.map(ordered):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,ordered(x[k])])):x
export function indexedCheckpointEvidence({runtime,live,sessionId,entry,now=Date.now()}){
 const no=reason=>({verified:false,reason})
 if(runtime?.integrity!==true||runtime.dependencyEvidence?.verified!==true||!(/^[a-f0-9]{64}$/).test(runtime.build??'')||!(/^[a-f0-9]{64}$/).test(runtime.bootstrapHash??'')||!Number.isInteger(runtime.generation)||runtime.generation<1||live?.entrypoint!=='claude-desktop'||!Number.isInteger(live.pid)||live.pid<=1||typeof live.procStart!=='string'||!live.procStart.trim()||typeof sessionId!=='string'||!sessionId)return no('current-native-entry-proof-required')
 const b=entry?.nativeBinding
 if(entry?.phase!=='completed'||!Number.isSafeInteger(entry.index)||entry.index<0||!/^r[A-Za-z0-9_-]{1,99}$/.test(entry.requestId??'')||entry.build!==runtime.build||entry.bootstrapHash!==runtime.bootstrapHash||entry.generation!==runtime.generation||!Number.isFinite(entry.at)||entry.at>now||b?.ancestorVerified!==true||b.brokerPid!==live.pid||b.brokerProcStart!==live.procStart||b.brokerSessionId!==sessionId)return no('indexed-native-checkpoint-not-observed')
 return {verified:true,reason:'indexed-completed-entry-in-current-native-epoch'}
}
export function validateBatchAdmission(ops,{native=false,indexed=false}={}){
 if(!native||indexed)return
 const seen=new Map(),duplicates=[]
 for(let i=0;i<ops.length;i++){
  const signature=JSON.stringify(ordered([ops[i].op,ops[i].args]))
  if(seen.has(signature))duplicates.push({first:seen.get(signature),second:i})
  else seen.set(signature,i)
 }
 if(duplicates.length)throw new DriverError('active native checkpoint cannot distinguish identical operation slots; use separate requests or a qualified indexed deployment',{category:'broker_ambiguous_batch',detail:{duplicates,dispatched:false,retrySafe:true}})
}
