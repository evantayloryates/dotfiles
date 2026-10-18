import {join} from 'node:path'
import {mkdirSync,lstatSync,writeFileSync} from 'node:fs'
import {STATE_DIR,writeJsonAtomic} from './state.mjs'
import {readReceiverFile} from './receiver-runtime-selection.mjs'
import {RUNTIME_BUILD} from './build.mjs'
import {DriverError} from './paths.mjs'
import {serviceSeedPlanDigest} from './seeded-record-restoration.mjs'
import {serviceSeedDigest} from './service-rebuild-seed.mjs'
const job=/^j[a-f0-9]{32}$/
const owned=dir=>{const s=lstatSync(dir);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.getuid()||s.mode&0o022)throw Error('seeded restoration directory unqualified')}
// Requires the original primary route lock. The claim survives every failure;
// another root must reconcile it, never infer a bootstrap/import did not land.
export function createSeededRestorationLedger(primary,role,plan,recipe,expectedPlanSha256,jobId,{dir=join(STATE_DIR,'seeded-service-restorations'),now=Date.now}={}){
 if(!job.test(jobId||'')||!['primary','standby'].includes(role)||plan.role!==role||plan.oldGenerationRetired!==false||serviceSeedPlanDigest(plan)!==expectedPlanSha256||serviceSeedDigest(recipe)!==plan.recipeSha256||recipe.sessionId!==plan.sessionId||recipe.identitySha256!==plan.identitySha256||!/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(primary||''))throw Error('exact seeded restoration context required')
 mkdirSync(dir,{recursive:true,mode:0o700});owned(dir);const claims=join(dir,'claims');mkdirSync(claims,{recursive:true,mode:0o700});owned(claims)
 const claim={jobId,sessionId:plan.sessionId,serviceId:plan.serviceId,expectedPlanSha256,recipeSha256:plan.recipeSha256,at:now()},claimFile=join(claims,plan.serviceId+'.json')
 try{writeFileSync(claimFile,JSON.stringify(claim)+'\n',{flag:'wx',mode:0o600})}catch(error){if(error.code!=='EEXIST')throw error;const prior=JSON.parse(readReceiverFile(claimFile,4096));throw new DriverError('seeded restoration already attempted; inspect original root before any new bootstrap/import',{category:'seeded_restoration_claimed',detail:{originalJobId:job.test(prior.jobId||'')?prior.jobId:null,retrySafe:false}})}
 const file=join(dir,jobId+'.json'),ledger={schemaVersion:1,jobId,primary,role,runtimeBuild:RUNTIME_BUILD,plan,recipe,expectedPlanSha256,phase:'claimed',steps:[],children:{},bootstrapAttempted:false,importAttempted:false,retrySafe:false,at:now()}
 writeFileSync(file,JSON.stringify(ledger)+'\n',{flag:'wx',mode:0o600})
 const save=()=>{if(!readReceiverFile(claimFile,4096).equals(Buffer.from(JSON.stringify(claim)+'\n')))throw Error('seeded restoration claim changed');writeJsonAtomic(file,ledger)}
 const record=async(phase,evidence)=>{ledger.phase=phase;ledger.steps.push({phase,at:now()});if(phase==='seed-before-bootstrap')ledger.bootstrapAttempted=true;if(phase==='before-import')ledger.importAttempted=true;ledger.observation=structuredClone(evidence);if(phase==='after-quiesce')ledger.quiescence=structuredClone(evidence);if(phase==='after-retire')ledger.retirement=structuredClone(evidence);if(phase==='seed-created')ledger.seed=structuredClone(evidence);if(phase==='record-restored')ledger.result=structuredClone(evidence);save()}
 return {ledger,file,save,record,fail:error=>{ledger.failure={category:typeof error.category==='string'&&/^[a-z][a-z0-9_-]{0,79}$/.test(error.category)?error.category:'seeded-restoration-unresolved',at:now()};save()}}
}
