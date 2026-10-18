import test from 'node:test'
import assert from 'node:assert/strict'
import {screenNativeServiceResult} from '../lib/native-peer-service-evidence.mjs'
import {reviewIndependentAttempts} from '../lib/independent-service-attempts.mjs'
const id='rpeer'+'c'.repeat(32),sid='a'.repeat(32),iso=n=>new Date(n).toISOString()
function fixture(){
 const config={id:sid,brokerSession:'local_11111111-1111-4111-8111-111111111111',brokerCwd:'/owned',build:'b'.repeat(64),notBefore:100,deadline:1000,maxRequests:2}
 const files={['.native-service-'+sid+'.ready.json']:{schemaVersion:1,scope:'owned-native-service-ready',serviceId:sid,brokerSession:config.brokerSession,brokerCwd:config.brokerCwd,build:config.build,registeredAt:iso(100),deadline:1000,maxRequests:2,nativeCallsRequested:0,modelCallsRequested:0},['.native-service-'+id+'.intent.json']:{schemaVersion:1,scope:'owned-native-service-intent',serviceId:sid,requestId:id,brokerSession:config.brokerSession,startedAt:iso(200)},['.native-service-'+id+'.no-dispatch.json']:{schemaVersion:1,scope:'owned-native-service-no-dispatch',serviceId:sid,requestId:id,brokerSession:config.brokerSession,observedAt:iso(300),reason:'cancelled',nativeMcpCallsRequested:0,modelCallsRequested:0}}
 return {files,args:{context:{config,epoch:{},pointer:{},policy:{},read:name=>{if(!(name in files))throw Object.assign(Error('missing'),{code:'ENOENT'});return files[name]}},reservedRequestIds:[],names:Object.keys(files),now:400}}
}
test('raw attempts are inventoried without budget slots and refusal remains unresolved',()=>{
 const {args}=fixture(),r=reviewIndependentAttempts(args)
 assert.deepEqual(r.unresolvedRequestIds,[id]);assert.deepEqual(r.callbackRefusalRequestIds,[id]);assert.equal(r.terminalAttemptReviewComplete,false);assert.equal(r.retirementAuthorized,false);assert.equal(r.scopedUnloadQualified,false)
})
test('reservation without intent or receipt remains unresolved and forged result cannot settle',()=>{
 const {args,files}=fixture();args.names=[];args.reservedRequestIds=[id];delete files['.native-service-'+id+'.intent.json'];files['results/'+id+'.native.json']={id,source:'native-peer-service-result',results:[]}
 const r=reviewIndependentAttempts(args);assert.deepEqual(r.unresolvedRequestIds,[id]);assert.deepEqual(r.settledRequestIds,[]);assert.deepEqual(r.callbackRefusalRequestIds,[])
})
test('foreign attempts ignored, mismatched owned identity and excessive inventories refuse',()=>{
 const {args,files}=fixture();files['.native-service-'+id+'.intent.json'].serviceId='foreign';assert.equal(reviewIndependentAttempts(args).attemptsReviewed,0)
 files['.native-service-'+id+'.intent.json'].serviceId=sid;files['.native-service-'+id+'.intent.json'].requestId='rpeer'+'d'.repeat(32);assert.throws(()=>reviewIndependentAttempts(args))
 args.names=Array(2049).fill('other');assert.throws(()=>reviewIndependentAttempts(args))
})
test('only exact already-published native results settle; corrupted admission or publication stays unresolved',()=>{
 const {args,files}=fixture(),c=args.context,build=c.config.build,owner=c.config.brokerSession,target='local_22222222-2222-4222-8222-222222222222'
 c.epoch={build,pid:42,procStart:'synthetic'};c.pointer={...c.epoch,sessionId:owner,generation:1,bootstrapHash:'d'.repeat(64),activatedAt:iso(50),nativeRequestBindingVersion:1};c.policy={sha256:'e'.repeat(64),settingsHash:'f'.repeat(64)}
 files['requests/'+id+'.json']={id,protocol:7,ops:[{op:'get_session',args:{session_id:target}}],createdAt:iso(150),expiresAt:900,nativeRuntimeBinding:{version:1,...c.epoch,sessionId:owner,generation:1,bootstrapHash:c.pointer.bootstrapHash},nativeEffectAdmissionPolicy:{version:1,handlerSha256:c.policy.sha256,settingsHash:c.policy.settingsHash}}
 files['.native-service-'+id+'.result.json']={schemaVersion:1,scope:'owned-native-service-result',serviceId:sid,requestId:id,brokerSession:owner,targetSession:target,startedAt:iso(200),receivedAt:iso(350),isError:false,content:[{type:'text',text:JSON.stringify({sessionId:target,isArchived:false,isRunning:false})}]}
 files['broker-check-'+id+'-0-g1.completed.json']={phase:'completed',requestId:id,index:0,build,generation:1,bootstrapHash:c.pointer.bootstrapHash,at:250,nativeBinding:{ancestorVerified:true,brokerPid:42,brokerProcStart:'synthetic',brokerSessionId:owner}}
 files['native-admission-'+id+'-0.json']={requestId:id,index:0,pid:42,procStart:'synthetic',build,generation:1,toolUseId:'toolu_plugin_'+'a'.repeat(30),at:300}
 files['controls/'+id+'.json']={id,dispatched:[0],state:'outcome_unknown'}
 files['results/'+id+'.native.json']={id,source:'native-peer-service-result',results:[{op:'get_session',ok:true,result:{sessionId:target,isArchived:false,isRunning:false},nativeToolUseId:'toolu_plugin_'+'a'.repeat(30)}]}
 // Obtain the exact public metadata shape from the same pure receipt reviewer.
 const reviewed=screenNativeServiceResult({config:c.config,epoch:c.epoch,pointer:c.pointer,request:files['requests/'+id+'.json'],receipt:files['.native-service-'+id+'.result.json'],ready:files['.native-service-'+sid+'.ready.json'],intent:files['.native-service-'+id+'.intent.json'],entry:files['broker-check-'+id+'-0-g1.completed.json'],admission:files['native-admission-'+id+'-0.json'],control:files['controls/'+id+'.json'],now:400})
 assert.equal(reviewed.receiptVerified,true)
 files['results/'+id+'.native.json'].results=[{op:'get_session',...reviewed.result,nativeToolUseId:reviewed.nativeToolUseId}]
 const before=JSON.stringify(files);assert.deepEqual(reviewIndependentAttempts(args).settledRequestIds,[id]);assert.equal(JSON.stringify(files),before)
 files['native-admission-'+id+'-0.json'].generation=2;assert.deepEqual(reviewIndependentAttempts(args).unresolvedRequestIds,[id]);files['native-admission-'+id+'-0.json'].generation=1
 files['results/'+id+'.native.json'].results[0].ok=false;assert.deepEqual(reviewIndependentAttempts(args).unresolvedRequestIds,[id])
})

test('unknown attempt diagnostics expose presence only and never settle missing or unreadable evidence',()=>{
 const {args,files}=fixture();files['requests/'+id+'.json']={ops:[{op:'send_message',args:{message:'PRIVATE_MESSAGE'}}],secret:'PRIVATE_SECRET'};files['controls/'+id+'.json']={state:'PRIVATE_STATE',dispatched:[]}
 const original=args.context.read;args.context.read=name=>{if(name==='native-admission-'+id+'-0.json')throw Error('PRIVATE_ERROR');return original(name)}
 const r=reviewIndependentAttempts(args),d=r.unresolvedAttempts[0]
 assert.equal(d.operation,'send_message');assert.equal(d.operationScope,'unqualified');assert.equal(d.evidence.request,'present');assert.equal(d.evidence.admission,'unreadable');assert.equal(d.evidence.moduleResult,'absent');assert.equal(d.outcome,'unknown');assert.equal(d.replayAuthorized,false);assert.equal(d.retirementAuthorized,false);assert.equal(r.terminalAttemptReviewComplete,false);assert.ok(!JSON.stringify(r).includes('PRIVATE_'))
})
test('unknown read diagnostic requires exact runtime binding and still forbids replay or retirement',()=>{
 const {args,files}=fixture(),c=args.context
 c.pointer={build:'b'.repeat(64),pid:42,procStart:'old',sessionId:c.config.brokerSession,generation:1,bootstrapHash:'d'.repeat(64),nativeRequestBindingVersion:1}
 files['requests/'+id+'.json']={ops:[{op:'list_sessions',args:{linked:true}}],nativeRuntimeBinding:{version:1,build:c.pointer.build,pid:42,procStart:'old',sessionId:c.pointer.sessionId,generation:1,bootstrapHash:c.pointer.bootstrapHash}}
 let r=reviewIndependentAttempts(args),d=r.unresolvedAttempts[0];assert.equal(d.operationScope,'metadata-read');assert.equal(d.runtimeBindingVerified,true);assert.deepEqual(r.unresolvedRequestIds,[id]);assert.equal(r.terminalAttemptReviewComplete,false);assert.equal(r.retirementAuthorized,false)
 files['requests/'+id+'.json'].nativeRuntimeBinding.pid=99;d=reviewIndependentAttempts(args).unresolvedAttempts[0];assert.equal(d.operationScope,'unqualified');assert.equal(d.runtimeBindingVerified,false)
 files['requests/'+id+'.json'].ops=[{op:'PRIVATE_OPERATION'}];assert.equal(reviewIndependentAttempts(args).unresolvedAttempts[0].operation,'unqualified')
})
