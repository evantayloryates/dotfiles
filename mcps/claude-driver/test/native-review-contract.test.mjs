import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {nativeReviewOrigin} from '../src/scripts/native-review-contract.mjs'
import {permittedNativeContractCall} from '../src/scripts/native-service-contract.mjs'
const id='j'+'1'.repeat(32),args={message:'exact',mode:'interrupt',session:'local_'+'2'.repeat(36)},submission={operation:'steer_session',arguments:args,timeout_sec:60},c={nativeSteer:true,nativeSend:true,serviceId:'service',target:args.session,submission},rows=[{event:'reply',name:'driver_wait',state:'completed',receiptVerified:true,jobId:id}],canonical=x=>x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x,job={id,state:'completed',operation:'steer_session',args,fingerprint:createHash('sha256').update(JSON.stringify(canonical({operation:submission.operation,args,timeout_sec:60}))).digest('hex'),result:{route:'independent-native-interrupt',serviceId:c.serviceId,sessionId:c.target}}
test('review binds an existing completed parent to the exact original operation fingerprint',()=>{
 assert.equal(nativeReviewOrigin(c,rows,job),id)
 for(const alter of [x=>x.state='running',x=>x.id='j'+'3'.repeat(32),x=>x.args.message='changed',x=>x.fingerprint='foreign',x=>x.result.serviceId='foreign',x=>x.result.route='independent-native-send']){const x=structuredClone(job);alter(x);assert.throws(()=>nativeReviewOrigin(c,rows,x))}
 assert.throws(()=>nativeReviewOrigin(c,[],job));assert.throws(()=>nativeReviewOrigin(c,rows,null))
})
test('read-only review refuses submission even of the original request and any foreign or expanded wait',()=>{
 const contract={...c,reviewOnly:true,reviewJobId:id},jobs=new Set([id]),wait={job_id:id,timeout_sec:20,include_result:true}
 assert.equal(permittedNativeContractCall(contract,jobs,'driver_wait',wait),true)
 assert.equal(permittedNativeContractCall(contract,jobs,'driver_submit',submission),false)
 for(const a of [{...wait,job_id:'foreign'},{...wait,timeout_sec:30},{...wait,extra:true}])assert.equal(permittedNativeContractCall(contract,jobs,'driver_wait',a),false)
 for(const op of ['stop_session','send_message','broker_service_status','driver_cancel'])assert.equal(permittedNativeContractCall(contract,jobs,op,{}),false)
})

test('Claude review verdict requires the exact provider-structured status, never a prose marker',async()=>{
 const {nativeReviewVerdict}=await import('../src/scripts/native-review-contract.mjs');assert.equal(nativeReviewVerdict({structured_output:{status:'NATIVE_MCP_OK'}},'claude'),true)
 for(const final of [{result:'NATIVE_MCP_OK'},{structured_output:{status:'NATIVE_MCP_FAILED'}},{structured_output:{status:'NATIVE_MCP_OK',extra:true}}])assert.equal(nativeReviewVerdict(final,'claude'),false)
 assert.equal(nativeReviewVerdict({item:{text:'NATIVE_MCP_OK'}},'codex'),true);assert.equal(nativeReviewVerdict({item:{text:'explanation NATIVE_MCP_OK'}},'codex'),false)
})
