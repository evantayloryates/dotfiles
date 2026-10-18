import {createHash} from 'node:crypto'
import {join} from 'node:path'
import {lstatSync,mkdirSync,writeFileSync} from 'node:fs'
import {STATE_DIR,writeJsonAtomic} from './state.mjs'
import {readReceiverFile} from './receiver-runtime-selection.mjs'
import {RUNTIME_BUILD} from './build.mjs'
import {DriverError} from './paths.mjs'
const job=/^j[a-f0-9]{32}$/,hex=/^[a-f0-9]{64}$/
export const restoredPairPlanDigest=plan=>createHash('sha256').update(JSON.stringify(plan)).digest('hex')
const owned=dir=>{const s=lstatSync(dir);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.getuid()||s.mode&0o022)throw Error('reactivation directory unqualified')}
// Called only while holding the original primary route lock. Claims never expire
// or move to a second attempt on a timeout: the first root owns reconciliation.
export function createRestoredPairLedger(plan,expectedPlanSha256,jobId,{dir=join(STATE_DIR,'restored-pair-reactivations'),now=Date.now}={}){
 if(!job.test(jobId||'')||!job.test(plan?.rootJobId||'')||jobId===plan.rootJobId||!hex.test(plan.rootSha256||'')||plan.pairPreparationEligible!==true||!hex.test(expectedPlanSha256||'')||restoredPairPlanDigest(plan)!==expectedPlanSha256)throw Error('exact durable reactivation plan required')
 mkdirSync(dir,{recursive:true,mode:0o700});owned(dir);const claims=join(dir,'claims');mkdirSync(claims,{recursive:true,mode:0o700});owned(claims)
 const claimFile=join(claims,plan.rootJobId+'.json'),claim={restorationJobId:plan.rootJobId,restorationRootSha256:plan.rootSha256,reactivationJobId:jobId,expectedPlanSha256,at:now()}
 try{writeFileSync(claimFile,JSON.stringify(claim)+'\n',{flag:'wx',mode:0o600})}catch(error){if(error.code!=='EEXIST')throw error;const prior=JSON.parse(readReceiverFile(claimFile,4096));throw new DriverError('restoration already has a reactivation attempt; inspect original root and children without replay',{category:'restored_pair_claimed',detail:{originalJobId:job.test(prior.reactivationJobId||'')?prior.reactivationJobId:null,retrySafe:false}})}
 const file=join(dir,jobId+'.json'),ledger={schemaVersion:1,jobId,plan,expectedPlanSha256,runtimeBuild:RUNTIME_BUILD,phase:'claimed',children:{},results:{},steps:[],retrySafe:false,at:now()}
 // If root publication fails, retain the claim. Never release ownership silently.
 writeFileSync(file,JSON.stringify(ledger)+'\n',{flag:'wx',mode:0o600})
 const save=()=>{if(JSON.stringify(JSON.parse(readReceiverFile(claimFile,4096)))!==JSON.stringify(claim))throw Error('reactivation claim changed');ledger.updatedAt=now();writeJsonAtomic(file,ledger)}
 return {ledger,file,save,record:async(phase,results)=>{ledger.phase=phase;ledger.results=structuredClone(results);ledger.steps.push({phase,at:now()});save()},fail:error=>{ledger.failure={category:error.category??'restored-pair-unresolved',at:now()};save()}}
}
export function restoredPairChildSubmission(plan,rootJobId,step){
 if(!job.test(rootJobId||''))throw Error('exact reactivation child owner required')
 const role=step.endsWith('-primary')?'primary':step.endsWith('-standby')?'standby':null,survivor=plan.restoredRole==='primary'?'standby':'primary';let operation,args
 if(step==='quiesce-survivor'||step==='retire-survivor'){operation=step==='quiesce-survivor'?'broker_service_quiesce':'broker_service_retire';args={session:plan.currentEpochs[survivor].sessionId,service_id:plan.originalServiceIds[survivor],experimental:true}}
 else if(role&&step==='prepare-'+role){operation='broker_service_prepare';args={session:plan.currentEpochs[role].sessionId,experimental:true,lifetime_sec:3600,max_requests:32,...plan.roles[role].prepareArguments}}
 else throw Error('reactivation child step requires exact supported lifecycle mapping')
 return {operation,arguments:args,idempotency_key:'restored-pair:'+rootJobId+':'+step,timeout_sec:120}
}
export {runDurableChild as runRestoredPairChild} from './durable-child.mjs'
// Separate ownership of the remaining suffix. The original restoration claim
// and failed reactivation root are never released, reassigned or overwritten.
export function createRestoredPairReadinessLedger(checkpoint,jobId,{dir=join(STATE_DIR,'restored-pair-reactivations'),now=Date.now}={}){
 const {root,proof}=checkpoint??{}
 if(!job.test(jobId||'')||jobId===root?.jobId||proof?.qualified!==true||proof.originalJobId!==root.jobId||proof.originalRootSha256!==restoredPairPlanDigest(root)||root.phase!=='before-readiness-primary'||root.continuation!==undefined)throw Error('exact pair readiness continuation context required')
 mkdirSync(dir,{recursive:true,mode:0o700});owned(dir);const claims=join(dir,'continuation-claims');mkdirSync(claims,{recursive:true,mode:0o700});owned(claims)
 const claim={originalJobId:root.jobId,originalRootSha256:proof.originalRootSha256,continuationJobId:jobId,restorationJobId:root.plan.rootJobId,restorationRootSha256:root.plan.rootSha256,expectedPlanSha256:root.expectedPlanSha256,at:now()},claimFile=join(claims,root.jobId+'.json')
 try{writeFileSync(claimFile,JSON.stringify(claim)+'\n',{flag:'wx',mode:0o600})}catch(e){if(e.code!=='EEXIST')throw e;const prior=JSON.parse(readReceiverFile(claimFile,4096));throw new DriverError('pair readiness continuation already claimed; inspect original continuation',{category:'restored_pair_continuation_claimed',detail:{originalJobId:job.test(prior.continuationJobId||'')?prior.continuationJobId:null,retrySafe:false}})}
 const ledger=structuredClone(root);delete ledger.failure;ledger.jobId=jobId;ledger.runtimeBuild=RUNTIME_BUILD;ledger.continuation={originalJobId:root.jobId,originalRootSha256:proof.originalRootSha256,preparedBuild:root.runtimeBuild};ledger.at=now()
 const file=join(dir,jobId+'.json');writeFileSync(file,JSON.stringify(ledger)+'\n',{flag:'wx',mode:0o600})
 const save=()=>{if(!readReceiverFile(claimFile,4096).equals(Buffer.from(JSON.stringify(claim)+'\n')))throw Error('pair continuation claim changed');ledger.updatedAt=now();writeJsonAtomic(file,ledger)}
 return {ledger,file,save,record:async(phase,results)=>{ledger.phase=phase;ledger.results=structuredClone(results);ledger.steps.push({phase,at:now()});save()},fail:e=>{ledger.failure={category:e.category??'restored-pair-continuation-unresolved',at:now()};save()}}
}
