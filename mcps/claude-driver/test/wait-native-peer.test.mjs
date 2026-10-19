import {test} from 'node:test'
import assert from 'node:assert/strict'
import {waitNativePeer} from '../src/lib/wait-native-peer.mjs'
const sessionId='local_00000000-0000-4000-8000-000000000001',record={sessionId,cwd:process.cwd()},peer={pid:123,procStart:'synthetic-epoch',entrypoint:'claude-desktop',sessionId:sessionId.slice(6),cwd:process.cwd(),status:'idle',version:'2.1.299'}
test('native open wait adopts exact owned peer while keeping serving and inference unverified',async()=>{
 let time=0,count=0;const r=await waitNativePeer(record,{timeoutMs:1000,observe:()=>++count<3?null:peer,now:()=>time,pause:async n=>time+=n});assert.equal(r.verified,true);assert.equal(r.pid,123);assert.equal(r.servingVerified,false);assert.equal(r.inferenceVerified,false);assert.equal(count,3)
})
test('wrong native identity, directory, entrypoint and status cannot qualify opening',async()=>{
 for(const change of [{sessionId:'foreign'},{cwd:'/path/does-not-exist'},{entrypoint:'cli'},{status:'unfamiliar'}]){let time=0;const r=await waitNativePeer(record,{timeoutMs:300,observe:()=>({...peer,...change}),now:()=>time,pause:async n=>time+=n});assert.equal(r.verified,false);assert.equal(r.reason,'native-peer-timeout')}
})
test('cancelled open wait reports unverified so caller can still restore its navigation focus',async()=>{
 const c=new AbortController();c.abort();const r=await waitNativePeer(record,{timeoutMs:300,signal:c.signal,observe:()=>{throw Error('must not observe')}});assert.equal(r.verified,false);assert.equal(r.reason,'cancelled')
})
