import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareMaintenance, validateMaintenance, releaseMaintenance} from '../lib/maintenance.mjs';
const status={engine:{pid:123},viewfinder:{lanes:[]},overlays:[]};
test('legacy requires explicit path and never starts work',async()=>{
 const calls=[];const call=async m=>{calls.push(m);return status};
 await assert.rejects(prepareMaintenance(call),e=>e.code==='maintenance_unsupported');assert.deepEqual(calls,['status']);
});
test('legacy idle stays visibly unfenced',async()=>{
 const call=async m=>m==='record.list'?{total:0}:status;
 const p=await prepareMaintenance(call,{allowLegacyIdle:true});assert.equal(p.mode,'legacy_observed_unfenced');assert.equal(p.pid,123);
 await validateMaintenance(call,p);
});
test('busy, unknown and changed legacy work refuse',async()=>{
 for(const jobs of [{total:1},{total:null},{}])await assert.rejects(prepareMaintenance(async m=>m==='record.list'?jobs:status,{allowLegacyIdle:true}),e=>e.code==='maintenance_busy');
 let reads=0;await assert.rejects(prepareMaintenance(async m=>m==='record.list'?{total:0}:{...status,engine:{pid:++reads}},{allowLegacyIdle:true}),e=>e.code==='maintenance_busy');
});
test('capable engine acquires and revalidates exact token/pid',async()=>{
 const calls=[];const call=async(m,p)=>{calls.push([m,p]);if(m==='status')return {...status,capabilities:{maintenance_fence:1}};if(m==='maintenance.acquire')return {token:'owned'};if(m==='maintenance.validate')return {pid:123,lease:{ready:true}};return {released:true}};
 const p=await prepareMaintenance(call);assert.equal(p.mode,'fenced');await validateMaintenance(call,p);await releaseMaintenance(call,p);
 assert.equal(calls[1][1].allow_unfinished_terminal,false);assert.equal(calls[2][1].token,'owned');assert.equal(calls[3][1].token,'owned');
});
test('mismatched engine cannot authorize maintenance',async()=>{
 await assert.rejects(validateMaintenance(async()=>({pid:999,lease:{ready:true}}),{mode:'fenced',token:'owned',pid:123}),e=>e.code==='maintenance_changed');
});
