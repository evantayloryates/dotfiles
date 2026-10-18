import {realpathSync} from 'node:fs'
import {sep} from 'node:path'
import {DriverError} from './paths.mjs'
export function validateOrdinaryLiveFixture({session,controller,record,registry,stateDir,status,peer,protectedIds=[],sameStore,quarantine},{canonical=realpathSync,now=Date.now()}={}){
 const blockers=[],refuse=reason=>blockers.push(reason),finish=()=>{if(blockers.length)throw new DriverError('ordinary live qualification refused: '+blockers.join('; '),{category:'qualification_gate',detail:{blockers,nativeEffectsRequested:0}})}
 if(quarantine!==true||session===controller||protectedIds.includes(session)||sameStore!==true)refuse('scope or quarantine')
 if(!record||record.sessionId!==session||record.isArchived||record.permissionMode!=='bypassPermissions'||record.worktreePath||record.prs?.some(p=>!['MERGED','CLOSED'].includes(String(p.state).toUpperCase()))||registry?.kind!=='create'||registry.cwd!==record.cwd||!/^claude-driver-(?:control-target|.*scratch)|^claude-driver v2 pressure /.test(record.title||''))refuse('owned active bypass scratch required')
 if(!record){finish()}
 try{if(!canonical(record.cwd).startsWith(canonical(stateDir)+sep+'probe'+sep))refuse('fixture folder outside owned probes')}catch{refuse('fixture folder outside owned probes')}
 if(record.titleSource!=='tool')refuse('explicit restorable locked title baseline required')
 if(!['low','medium','high','xhigh','max'].includes(record.effort))refuse('explicit restorable baseline effort required')
 if(!peer||peer.hostSessionId!==session||peer.sessionId!==record.cliSessionId||peer.cwd!==record.cwd||peer.entrypoint!=='claude-desktop'||peer.version!=='2.1.299'||peer.status!=='idle'||!Number.isSafeInteger(peer.pid)||peer.pid<2||!peer.procStart)refuse('exact native idle fixture required')
 if(!status?.verified||status.sessionId!==controller||status.verificationMode!=='live-native'||status.sourceDisposition!=='installed'||status.nativeEpochAssessed!==true||status.nativeEpoch?.status!=='idle'||status.nativeInputRequired!==false||status.readinessObserved!==true||status.nativePolicyObserved!==true||status.admissionStopped!==false||status.terminalAttemptReviewComplete!==true||!Array.isArray(status.unresolvedRequestIds)||status.unresolvedRequestIds.length||!Number.isSafeInteger(status.deadline)||!Number.isInteger(status.unreservedSlots)||status.deadline-now<180000||status.unreservedSlots<18||['sessionManagementControl','sessionMetadataControl','sessionSendControl','sessionStopControl'].some(k=>status[k]!==true))refuse('controller readiness, grants or whole-profile margin')
 finish()
 return {qualified:true,session,controller,fixtureEpoch:{pid:peer.pid,procStart:peer.procStart},nativeEffectsRequested:0}
}
export function ordinaryBatchQualification(result,operations){
 if(!result?.verified||result.receiptVerified!==true||result.route!=='independent-session-management'||!Array.isArray(operations)||operations.length!==new Set(operations).size||Object.keys(result.requestIds??{}).length!==operations.length)throw Error('ordinary batch receipt shape unqualified')
 const ids=operations.map(op=>result.requestIds[op]);if(ids.some(id=>!/^rpeer[a-f0-9]{32}$/.test(id||''))||new Set(ids).size!==ids.length)throw Error('ordinary batch request identities unqualified')
 return {operations:operations.length,nativeRequests:ids.length,requestIds:ids,receiptVerified:true}
}
