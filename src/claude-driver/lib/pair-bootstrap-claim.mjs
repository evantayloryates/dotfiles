import {join} from 'node:path'
import {mkdirSync,writeFileSync,lstatSync} from 'node:fs'
import {STATE_DIR,writeJsonAtomic} from './state.mjs'
import {readReceiverFile} from './receiver-runtime-selection.mjs'
import {readPairBootstrapRoot} from './pair-bootstrap-proof.mjs'
import {inspectJob} from './jobs.mjs'
import {DriverError} from './paths.mjs'
const job=/^j[a-f0-9]{32}$/
export function pairContinuationClaimReplaceAllowed(claim,previous,parent,original,{rootJobId,rootSha256}={}){
 const allowed=new Set(['preflight','quiesce-primary','retire-primary','quiesce-standby','retire-standby','import-primary','import-standby'])
 return !!(claim?.originalRootJobId===rootJobId&&claim.expectedRootSha256===rootSha256&&job.test(claim.continuationJobId||'')&&previous?.jobId===claim.continuationJobId&&previous.continuationOf===rootJobId&&previous.originalRootSha256===rootSha256&&previous.newEffectsStarted===false&&previous.failure&&parent?.jobId===previous.jobId&&parent.operation==='broker_service_continue_pair_bootstrap'&&parent.state==='failed'&&parent.error?.category==='pair_bootstrap_unresolved'&&parent.args?.original_root_job_id===rootJobId&&parent.args.expected_root_sha256===rootSha256&&JSON.stringify(previous.children)===JSON.stringify(original.children)&&JSON.stringify(previous.importIntents)===JSON.stringify(original.importIntents)&&Object.keys(previous.results??{}).every(k=>allowed.has(k)))
}
// Caller holds the exact primary route lock. Retain claim history before CAS;
// only a terminal failed continuation with NO new publication may release it.
export async function claimPairBootstrapContinuation(rootJobId,rootSha256,continuationJobId,original,{dir=join(STATE_DIR,'pair-bootstrap-continuations'),readRoot=readPairBootstrapRoot,inspect=inspectJob}={}){
 if(!job.test(rootJobId||'')||!job.test(continuationJobId||'')||rootJobId===continuationJobId||!/^[a-f0-9]{64}$/.test(rootSha256||''))throw Error('pair continuation claim identity')
 mkdirSync(dir,{recursive:true,mode:0o700});const st=lstatSync(dir);if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==process.getuid()||st.mode&0o022)throw Error('pair continuation claim directory unqualified');const file=join(dir,rootJobId+'.json'),next={originalRootJobId:rootJobId,expectedRootSha256:rootSha256,continuationJobId,at:Date.now()}
 try{writeFileSync(file,JSON.stringify(next),{flag:'wx',mode:0o600});return {claimed:true,reassigned:false}}catch(error){if(error.code!=='EEXIST')throw error}
 const bytes=readReceiverFile(file,4096),prior=JSON.parse(bytes),owner=prior.continuationJobId
 const refuse=()=>{throw new DriverError('original root already claimed; inspect existing continuation without replay',{category:'pair_bootstrap_continuation_claimed',detail:{originalRootJobId:rootJobId,continuationJobId:job.test(owner||'')?owner:null,retrySafe:false}})}
 if(!job.test(owner||'')||owner===continuationJobId)refuse()
 const previous=readRoot(owner),parent=await inspect(owner,{includeResult:true})
 if(!pairContinuationClaimReplaceAllowed(prior,previous,parent,original,{rootJobId,rootSha256}))refuse()
 const history=join(dir,rootJobId+'.'+owner+'.retained.json')
 try{writeFileSync(history,bytes,{flag:'wx',mode:0o600})}catch(error){if(error.code!=='EEXIST'||!readReceiverFile(history,4096).equals(bytes))throw error}
 if(!readReceiverFile(file,4096).equals(bytes))refuse()
 writeJsonAtomic(file,{...next,previousContinuationJobId:owner})
 const after=JSON.parse(readReceiverFile(file,4096));if(after.continuationJobId!==continuationJobId||after.expectedRootSha256!==rootSha256)throw Error('pair claim publication uncertain')
 return {claimed:true,reassigned:true,previousContinuationJobId:owner,historyFile:history}
}
