import {test} from 'node:test'
import assert from 'node:assert/strict'
import {qualifyOfflineReadAbandonment,offlineReadAbandonmentMatches,runOfflineReadAbandonment} from '../src/lib/offline-read-abandonment.mjs'
import {reviewIndependentAttempts} from '../src/lib/independent-service-attempts.mjs'
const id='rpeer'+'a'.repeat(32),job='j'+'b'.repeat(32),sid='local_11111111-1111-4111-8111-111111111111'
function fixture(){
 const pointer={sessionId:sid,pid:123,procStart:'old',generation:1,build:'c'.repeat(64),bootstrapHash:'d'.repeat(64),nativeRequestBindingVersion:1},config={id:'e'.repeat(32),brokerSession:sid},policy={sha256:'f'.repeat(64),settingsHash:'1'.repeat(64)},files={}
 files['requests/'+id+'.json']={id,protocol:7,expiresAt:100,ops:[{op:'list_sessions',args:{include_archived:true,limit:100,linked:true}}],nativeObservation:{brokerSessionId:sid,cliSessionId:sid.slice(6)},nativeRuntimeBinding:{version:1,...Object.fromEntries(['sessionId','pid','procStart','generation','build','bootstrapHash'].map(k=>[k,pointer[k]]))},nativeEffectAdmissionPolicy:{version:1,handlerSha256:policy.sha256,settingsHash:policy.settingsHash}}
 files['.native-service-'+id+'.intent.json']={serviceId:config.id,requestId:id,brokerSession:sid,startedAt:new Date(50).toISOString()};files['controls/'+id+'.json']={id,state:'native-service-read-finished',dispatched:[]}
 const c={config,pointer,policy,read:n=>{if(!(n in files))throw Object.assign(Error('missing'),{code:'ENOENT'});return files[n]}},calls=[]
 const d={lock:async fn=>fn(),context:async()=>c,absence:async()=>calls.push('absence'),now:()=>200,write:async m=>{calls.push('write');files['.offline-read-abandoned-'+id+'.json']=m},read:async()=>files['.offline-read-abandoned-'+id+'.json']}
 return {c,files,calls,d}
}
test('abandonment preserves unknown outcome and request; reviewed reads never become settled receipts',async()=>{
 const {c,files,d,calls}=fixture(),before=JSON.stringify(files['requests/'+id+'.json']),r=await runOfflineReadAbandonment(id,job,d)
 assert.equal(r.resultAbandoned,true);assert.equal(r.outcome,'unknown');assert.equal(r.replayAuthorized,false);assert.equal(r.nativeReceiptVerified,false);assert.deepEqual(calls,['absence','absence','write','absence']);assert.equal(JSON.stringify(files['requests/'+id+'.json']),before)
 const a=reviewIndependentAttempts({context:c,reservedRequestIds:[id],names:[],now:200});assert.deepEqual(a.abandonedReadRequestIds,[id]);assert.deepEqual(a.settledRequestIds,[]);assert.deepEqual(a.unresolvedRequestIds,[]);assert.equal(a.terminalAttemptReviewComplete,true);assert.equal(a.retirementAuthorized,false)
})
test('mutations, mixed requests, wrong binding/scope, live worker and late evidence refuse before writing',async()=>{
 for(const mutate of [f=>f.files['requests/'+id+'.json'].ops[0].op='send_message',f=>f.files['requests/'+id+'.json'].ops.push({op:'get_session'}),f=>f.c.pointer.nativeRequestBindingVersion=undefined,f=>f.files['requests/'+id+'.json'].nativeRuntimeBinding.pid=999,f=>f.files['requests/'+id+'.json'].ops[0].args.linked=false,f=>f.files['requests/'+id+'.json'].expiresAt=200,f=>f.files['controls/'+id+'.json'].state='running',f=>f.files['controls/'+id+'.json'].dispatched=[0],f=>f.files['native-admission-'+id+'-0.json']={},f=>f.files['results/'+id+'.native.json']={},f=>f.files['requests/'+id+'.json'].nativeSessionTargetBinding={}]){
 const f=fixture();mutate(f);await assert.rejects(runOfflineReadAbandonment(id,job,f.d));assert.equal(f.calls.includes('write'),false)
 }
})
test('unknown operation, malformed get_session and unreadable evidence cannot become abandoned',()=>{
 const f=fixture(),request=f.files['requests/'+id+'.json'];request.ops=[{op:'get_session',args:{session_id:'local_22222222-2222-4222-8222-222222222222'}}];assert.equal(qualifyOfflineReadAbandonment(f.c,id,200).operation,'get_session');request.ops[0].args.extra=true;assert.throws(()=>qualifyOfflineReadAbandonment(f.c,id,200));delete request.ops[0].args.extra;const read=f.c.read;f.c.read=n=>{if(n.startsWith('native-admission'))throw Error('unreadable');return read(n)};assert.throws(()=>qualifyOfflineReadAbandonment(f.c,id,200))
})
test('PID reuse, surviving same-host peer and changed context cannot authorize checkpoint',async()=>{
 for(const failAt of [1,2]){const f=fixture();let n=0;f.d.absence=async()=>{if(++n===failAt)throw Error('native epoch not absent')};await assert.rejects(runOfflineReadAbandonment(id,job,f.d));assert.equal(f.calls.includes('write'),false)}
 const f=fixture();await runOfflineReadAbandonment(id,job,f.d);const marker=f.files['.offline-read-abandoned-'+id+'.json'];for(const patch of [{pid:999},{requestSha256:'0'.repeat(64)},{previousPidObservedAbsent:false},{at:999}])assert.equal(offlineReadAbandonmentMatches(f.c,id,{...marker,...patch},200),false)
 f.files['requests/'+id+'.json'].ops[0].op='stop_session';assert.equal(offlineReadAbandonmentMatches(f.c,id,marker,200),false)
})
