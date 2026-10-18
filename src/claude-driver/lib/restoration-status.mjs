import {createHash} from 'node:crypto'
import {join} from 'node:path'
import {STATE_DIR} from './state.mjs'
import {readReceiverFile} from './receiver-runtime-selection.mjs'
import {inspectJob} from './jobs.mjs'
const job=/^j[a-f0-9]{32}$/,hex=/^[a-f0-9]{64}$/
const specs={record:{directory:'missing-service-restorations',operation:'broker_service_restore_missing_record',steps:['quiesce','retire']},pair:{directory:'restored-pair-reactivations',operation:'broker_service_reactivate_restored_pair',steps:['prepare-primary','prepare-standby','quiesce-survivor','retire-survivor','activate-primary','activate-standby','policy-primary','policy-standby','rebind-metadata']}}
const states=new Set(['queued','running','completed','failed','cancelled','outcome_unknown'])
const digest=r=>createHash('sha256').update(JSON.stringify(r)).digest('hex')
const category=e=>typeof e?.category==='string'&&/^[a-z][a-z0-9_-]{0,79}$/.test(e.category)?e.category:null
const summary=r=>({jobId:r.jobId,state:states.has(r.state)?r.state:'unqualified',failureCategory:category(r.error)})
// Inspection never dispatches, adopts an uncertain result or authorizes retry.
export async function inspectRestorationStatus(rootJobId,kind,{base=STATE_DIR,inspect=id=>inspectJob(id,{includeResult:false}),read=(file,limit)=>readReceiverFile(file,limit)}={}){
 if(!job.test(rootJobId||'')||!Object.hasOwn(specs,kind))throw Error('exact recovery job and kind required')
 const spec=specs[kind],file=join(base,spec.directory,rootJobId+'.json'),parent=await inspect(rootJobId)
 if(parent?.jobId!==rootJobId||parent.operation!==spec.operation)throw Error('recovery parent operation differs')
 const common={kind,rootJobId,parent:summary(parent),nativeEpochAssessed:false,servingQualified:false,effectsPerformed:false,replayAuthorized:false,retrySafe:false}
 let root
 try{root=JSON.parse(read(file,1048576))}catch(error){if(error.code==='ENOENT')return {...common,journalAvailable:false,reason:'journal-not-published'};throw error}
 if(root.schemaVersion!==1||root.jobId!==rootJobId||!hex.test(root.runtimeBuild||'')||typeof root.phase!=='string'||!/^[A-Za-z][-A-Za-z0-9]{0,79}$/.test(root.phase)||!root.children&&kind==='pair'||Object.keys(root.children??{}).some(k=>!spec.steps.includes(k)))throw Error('recovery journal unqualified')
 const children={}
 for(const [step,c]of Object.entries(root.children??{})){
  if(c.jobId!==undefined&&!job.test(c.jobId))throw Error('recovery child handle unqualified')
  if(c.jobId){const current=await inspect(c.jobId);if(current.jobId!==c.jobId||current.operation!==c.submission?.operation)throw Error('recovery child operation differs');children[step]={...summary(current),observationRetained:c.observation!==undefined}}
  else children[step]={jobId:null,state:'submission-unconfirmed',observationRetained:false}
 }
 if(digest(JSON.parse(read(file,1048576)))!==digest(root))throw Error('recovery journal changed during inspection')
 return {...common,journalAvailable:true,rootSha256:digest(root),runtimeBuild:root.runtimeBuild,phase:root.phase,failureCategory:category(root.failure),children,...kind==='record'?{importAttempted:root.importAttempted===true,recordRestored:root.result?.recordRestored===true}:{restorationJobId:job.test(root.plan?.rootJobId||'')?root.plan.rootJobId:null,importAttempted:false,pairVerified:root.results?.verifyEnrollment?.qualified===true},...hex.test(root.expectedPlanSha256||'')?{planSha256:root.expectedPlanSha256}:{}}
}
