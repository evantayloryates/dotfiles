import {test} from 'node:test'
import assert from 'node:assert/strict'
import {requireIndependentEpochAbsent,reviewIndependentOfflineContext,requireIndependentOfflineMutation} from '../src/lib/independent-offline-review.mjs'
const pointer={pid:42,procStart:'synthetic epoch'}
test('offline evidence requires affirmative PID absence before and after review',async()=>{
 let observations=0,reviews=0
 const r=await reviewIndependentOfflineContext(pointer,async()=>{reviews++;return {unresolvedRequestIds:['original']};},pid=>{assert.equal(pid,42);observations++;return null})
 assert.equal(observations,2);assert.equal(reviews,1);assert.equal(r.observation.previousPidObservedAbsent,true)
 assert.deepEqual(r.result.unresolvedRequestIds,['original'])
 assert.equal(Object.hasOwn(r.observation,'crashed'),false)
})
test('present, reused, unavailable and reappearing PID refuse without recovery',async()=>{
 for(const inspect of [()=>({pid:42,procStart:pointer.procStart}),()=>({pid:42,procStart:'reused'}),()=>undefined,()=>{throw Error('ps unavailable')}]){
  let reviewed=false;await assert.rejects(reviewIndependentOfflineContext(pointer,async()=>{reviewed=true},inspect));assert.equal(reviewed,false)
 }
 let n=0;await assert.rejects(reviewIndependentOfflineContext(pointer,async()=>true,()=>++n===1?null:{pid:42}))
 for(const p of [null,{pid:1,procStart:'x'},{pid:42,procStart:''},{pid:42.5,procStart:'x'}])assert.throws(()=>requireIndependentEpochAbsent(p,()=>null))
})
test('offline mutation refuses a successor or ambiguous same-host peers and retains exact owner',()=>{
 const session='local_11111111-1111-4111-8111-111111111111',p={...pointer,sessionId:session},inspect=()=>null
 assert.equal(requireIndependentOfflineMutation(p,session,{inspect,processes:()=>[]}).previousPidObservedAbsent,true)
 for(const peers of [[{hostSessionId:session,pid:43}],[{hostSessionId:session,pid:43},{hostSessionId:session,pid:44}],null])assert.throws(()=>requireIndependentOfflineMutation(p,session,{inspect,processes:()=>peers}))
 assert.throws(()=>requireIndependentOfflineMutation(p,'foreign',{inspect,processes:()=>[]}))
 assert.throws(()=>requireIndependentOfflineMutation(p,session,{inspect,processes:()=>{throw Error('inventory unavailable')}}))
})
