import {test} from 'node:test'
import assert from 'node:assert/strict'
import {inputFreeProbeArgs} from '../lib/input-free-probe.mjs'
const flags={'input-free':true,controller:'local_11111111-1111-4111-8111-111111111111',session:'local_22222222-2222-4222-8222-222222222222'}
test('preflight cannot opt into effects and probe cannot silently select or create a fixture',()=>{
 assert.equal(inputFreeProbeArgs('preflight',flags).at(-1),'--preflight-only')
 assert.equal(inputFreeProbeArgs('probe',{...flags,live:true}).at(-1),'--live')
 for(const [kind,args] of [['probe',flags],['preflight',{...flags,live:true}],['probe',{...flags,live:'false'}],['preflight',{...flags,session:flags.controller}],['preflight',{...flags,session:'Work'}],['preflight',{...flags,controller:undefined}],['preflight',{...flags,'input-free':'false'}],['probe',{...flags,live:true,keep:true}]])assert.throws(()=>inputFreeProbeArgs(kind,args))
})
