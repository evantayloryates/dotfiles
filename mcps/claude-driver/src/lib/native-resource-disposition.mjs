import {createHash} from 'node:crypto'
import {buildNativeResourceProgram} from './native-resource-program.mjs'
import {screenNativeResourceEvidence} from './native-resource-evidence.mjs'
// Qualifies only observed disposal of this exact child after owned retirement.
// General hook/environment unload and release authorization remain separate.
export function reviewNativeResourceDisposition({config,epoch,intent,ready,exit,observations,retirement,absent,now}){
 const no={resourceDisposalQualified:false,scopedUnloadQualified:false,releaseAuthorized:false}
 try{
  const screened=screenNativeResourceEvidence({config,intent,ready,exit,now}),retired=Date.parse(retirement.at),ended=Date.parse(exit.exitedAt)
  if(!screened.valid||!screened.exitObserved||screened.reason!=='SIGTERM'||!screened.endedBeforeDeadline||retirement.serviceId!==config.id||retirement.filesRetired!==true||!Number.isFinite(retired)||retired<=config.deadline||ended<retired||absent?.state!=='absent'||absent.pid!==ready.pid||Date.parse(absent.observedAt)<ended||Date.parse(absent.observedAt)>now)return no
  if(!Array.isArray(observations)||observations.length!==2)return no
  const argv=['/opt/homebrew/bin/node','--input-type=module','-e',buildNativeResourceProgram({serviceId:config.id,deadline:config.deadline+30000,evidenceRoot:config.brokerCwd})].join(' ')
  const hashes=[argv,argv.replaceAll('\n','\\012')].map(s=>createHash('sha256').update(s).digest('hex'))
  let prior=Date.parse(ready.startedAt),identity=null
  for(const row of observations){
   const at=Date.parse(row.observedAt),start=Date.parse(row.procStart+' UTC')
   if(row.state!=='alive'||row.ownershipVerified!==true||row.pid!==ready.pid||row.ppid!==ready.ppid||!hashes.includes(row.commandSha256)||!Number.isFinite(at)||at<prior||at>retired||!Number.isFinite(start)||Date.parse(ready.startedAt)<start||Date.parse(ready.startedAt)-start>10000||!Array.isArray(row.ancestry)||row.ancestry.length<1||row.ancestry.length>8)return no
   let parent=row.ppid;const seen=new Set([row.pid])
   for(const a of row.ancestry){if(a.pid!==parent||seen.has(a.pid)||!Number.isSafeInteger(a.pid)||!Number.isSafeInteger(a.ppid))return no;seen.add(a.pid);parent=a.ppid}
   const broker=row.ancestry.at(-1);if(broker.pid!==epoch.pid||broker.procStart!==epoch.procStart)return no
   const current=JSON.stringify([row.pid,row.ppid,row.procStart,row.commandSha256,row.ancestry]);if(identity!==null&&identity!==current)return no;identity=current;prior=at
  }
  if(retired-prior>5000)return no
  return {...no,resourceDisposalQualified:true,scope:'exact-owned-stream-child-after-retirement',serviceId:config.id,exitReason:'SIGTERM',exitDelayMs:ended-retired}
 }catch{return no}
}
