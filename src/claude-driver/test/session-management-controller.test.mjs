import {test} from 'node:test'
import assert from 'node:assert/strict'
import {inspectSessionManagementController,sessionManagementController} from '../lib/session-management-controller.mjs'
import {standbyEnrollmentDigest} from '../lib/standby-enrollment.mjs'
const controller='local_11111111-1111-4111-8111-111111111111',serviceId='a'.repeat(32),build='b'.repeat(64)
function fixture(){const row={schemaVersion:1,controllerSession:controller,receiverCwd:'/owned/controller',enrolledAt:100},selected={selector:{sessionId:controller,serviceId,pid:42,procStart:'epoch',build},pointer:{sessionManagementControl:true},policy:{sessionManagementControl:true}},status={sessionId:controller,serviceId,build,verified:true,verificationMode:'live-native',nativeEpochAssessed:true,nativeEpoch:{pid:42,procStart:'epoch',status:'idle'},sourceDisposition:'installed',sessionManagementControl:true,admissionStopped:false,nativeInputRequired:false,terminalAttemptReviewComplete:true,unresolvedRequestIds:[],unreservedSlots:8,deadline:100000,readinessObserved:true,nativePolicyObserved:true};return {row,selected,status,d:{requiredBuild:build,readPair:()=>null,read:()=>row,record:()=>({cwd:row.receiverCwd}),select:()=>selected,inspect:async()=>status,now:()=>1000}}}
test('status distinguishes a configured ordinary route from legacy health without effects or broad discovery',async()=>{const f=fixture(),r=await inspectSessionManagementController({},f.d);assert.equal(r.configured,true);assert.deepEqual(r.operations,['unarchive_session','pin_session']);assert.equal(r.health.nativeReadAdmission,'observed');assert.equal(r.nativeEffectsRequested,0);assert.equal(r.recoveryAttempted,false);assert.equal(JSON.stringify(r).includes('/owned'),false);assert.deepEqual(await inspectSessionManagementController({},{read:()=>null}),{configured:false,operations:[],nativeEffectsRequested:0,recoveryAttempted:false})})
test('missing capability, changed selection, foreign epoch and unreadable evidence never qualify route health',async()=>{for(const mutate of [f=>delete f.selected.pointer.sessionManagementControl,f=>delete f.status.sessionManagementControl,f=>f.status.nativeEpoch.pid=43,f=>f.status.build='c'.repeat(64),f=>f.d.record=()=>null,f=>f.d.inspect=async()=>{throw Error('private failure')},f=>{let reads=0;f.d.select=()=>++reads===1?f.selected:{...f.selected,selector:{...f.selected.selector,serviceId:'c'.repeat(32)}}}]){const f=fixture();mutate(f);const r=await inspectSessionManagementController({},f.d);assert.equal(r.health.nativeReadAdmission,'unverified');assert.deepEqual(r.operations,[]);assert.equal(JSON.stringify(r).includes('private failure'),false)}})
test('expired or unresolved native service stays observable but cannot be reported admitted',async()=>{for(const patch of [{deadline:999},{unresolvedRequestIds:['unknown']},{admissionStopped:true},{nativePolicyObserved:false}]){const f=fixture();Object.assign(f.status,patch);const r=await inspectSessionManagementController({},f.d);assert.equal(r.configured,true);assert.equal(r.health.nativeReadAdmission,'unverified');assert.equal(r.recoveryAttempted,false)}})

test('route readiness separates current source and retained pair from local native process evidence',async()=>{
 for(const mode of ['ready','source','pair','pair-race']){const f=fixture();if(mode==='source')f.d.requiredBuild='c'.repeat(64);if(mode==='pair'){const pair=missingFixture().pair;pair.primary.serviceId='d'.repeat(32);f.d.readPair=()=>pair;}if(mode==='pair-race'){let reads=0;f.d.readPair=()=>++reads===1?null:{primary:{sessionId:controller,serviceId}}}const r=await inspectSessionManagementController({},f.d);if(mode==='pair-race'){assert.equal(r.health.nativeReadAdmission,'unverified');assert.deepEqual(r.operations,[])}else{assert.equal(r.health.nativeReadAdmission,'observed');assert.equal(r.routeReadiness.admission,mode==='ready'?'observed':mode==='source'?'source-maintenance-required':'pair-reconciliation-required');assert.equal(r.routeReadiness.operationAuthorized,false);assert.equal(r.routeReadiness.targetAssessed,false)}}
})

function missingFixture(){
 const f=fixture(),standby='local_22222222-2222-4222-8222-222222222222'
 const pair={schemaVersion:2,automaticRecovery:true,enrolledAt:100,familyRequestId:'rpeer'+'c'.repeat(32),primary:{sessionId:controller,serviceId,cwd:f.row.receiverCwd,pid:42,procStart:'epoch'},standby:{sessionId:standby,serviceId:'d'.repeat(32),cwd:'/owned/standby',pid:43,procStart:'standby-epoch'}}
 const identity={schemaVersion:1,sessionId:controller,serviceId,jobId:null,cwd:f.row.receiverCwd,cliSessionId:controller.slice(6),permissionMode:'bypassPermissions',storeHash:'e'.repeat(64),capturedAt:100}
 Object.assign(f.d,{record:()=>null,select:()=>{throw Error('must not select or inspect native generation')},inspect:async()=>{throw Error('must not inspect native generation')},readPair:()=>pair,readIdentity:()=>identity,accountHash:()=>identity.storeHash,probeRoot:'/owned'})
 return {...f,pair,identity}
}
test('ordinary dispatch names missing saved controller distinctly without falling back or implying process absence',()=>{
 const f=missingFixture(),target=f.pair.standby.sessionId
 assert.throws(()=>sessionManagementController(target,f.d),e=>e.category==='session_management_controller_record_missing'&&e.detail.targetSession===target&&e.detail.controllerSession===controller&&e.detail.targetDispatched===false&&e.detail.recordRestorationAttempted===false&&e.detail.nativeEpochAssessed===false&&e.detail.replayAuthorized===false)
 assert.throws(()=>sessionManagementController(controller,f.d),e=>e.category==='session_management_controller_unqualified')
 assert.throws(()=>sessionManagementController(target,{...f.d,record:()=>({cwd:'/foreign'})}),e=>e.category==='session_management_controller_unqualified')
})
test('missing-controller health exposes only an exact read-only plan bound to retained account and pair',async()=>{
 const f=missingFixture(),r=await inspectSessionManagementController({},f.d)
 assert.equal(r.reason,'controller-saved-record-missing');assert.equal(r.routeReadiness.admission,'record-restoration-required');assert.deepEqual(r.operations,[])
 assert.deepEqual(r.recoveryReadiness.inspection,{operation:'broker_service_missing_record_plan',arguments:{session:controller,role:'primary',expected_enrollment_sha256:standbyEnrollmentDigest(f.pair)}})
 assert.equal(r.recoveryReadiness.nativeEpochAssessed,false);assert.equal(r.recoveryReadiness.nativeEffectsRequested,0);assert.equal(r.recoveryReadiness.recordRestorationAttempted,false);assert.equal(r.recoveryAttempted,false)
 assert.equal(JSON.stringify(r).includes('/owned'),false)
})
test('missing-controller plan hints disappear on invalid identity, foreign account, disabled pair or evidence races',async()=>{
 for(const mutate of [f=>f.d.readPair=()=>null,f=>f.pair.automaticRecovery=false,f=>f.pair.primary.cwd='/foreign',f=>f.d.readIdentity=()=>null,f=>f.identity.permissionMode='acceptEdits',f=>f.d.accountHash=()=>'f'.repeat(64),f=>f.identity.serviceId='b'.repeat(32),f=>{let calls=0;f.d.read=()=>++calls===1?f.row:{...f.row,enrolledAt:101}},f=>{let calls=0;f.d.readPair=()=>++calls===1?f.pair:{...f.pair,enrolledAt:101}},f=>{let calls=0;f.d.record=()=>++calls===1?null:{cwd:f.row.receiverCwd}}]){
  const f=missingFixture();mutate(f);const r=await inspectSessionManagementController({},f.d)
  assert.equal(r.health.nativeReadAdmission,'unverified');assert.equal(r.recoveryReadiness?.inspection,undefined);assert.equal(r.nativeEffectsRequested,0)
 }
 const f=missingFixture(),abort=new AbortController();abort.abort();assert.equal((await inspectSessionManagementController({signal:abort.signal},f.d)).recoveryReadiness.inspection,undefined)
})
test('a restored saved record cannot hide a pending recovery claim from read-only health',async()=>{
 const f=missingFixture();f.d.record=()=>({cwd:f.row.receiverCwd,permissionMode:'dontAsk'});f.d.inspectRecordRecovery=async()=>({configured:true,checkpointVerified:true,recoveryParentJobId:'j'+'8'.repeat(32),phase:'record-restored-pair-pending',nativeEffectsRequested:0,recoveryAttempted:false})
 const r=await inspectSessionManagementController({},f.d);assert.equal(r.reason,'controller-record-recovery-pending');assert.equal(r.routeReadiness.admission,'record-recovery-pending');assert.deepEqual(r.operations,[]);assert.equal(r.recoveryReadiness.phase,'record-restored-pair-pending');assert.equal(r.nativeEffectsRequested,0)
})
