import test from 'node:test'
import assert from 'node:assert/strict'
import {admitKeeperFilters} from '../../candidates/input-keeper/filter-audit.mjs'
const helper={pid:10,group:9,path:'/owned/Codex Computer Use.app/Contents/MacOS/SkyComputerUseService'},app={pid:20,path:'/owned/InputFixture'},aux={pid:30,path:'/System/Library/PrivateFrameworks/ViewBridge.framework/Versions/A/XPCServices/ViewBridgeAuxiliary.xpc/Contents/MacOS/ViewBridgeAuxiliary'}
const tap=(tapId,ownerPid,targetPid)=>({enabled:true,mask:'7168',targetPid,tapId,ownerPid,options:0}),baseline=[{...tap(1,40,0),options:1}],targets=[{...app,role:'target-app'},{...aux,role:'engine-auxiliary'}]
const spec=()=>({taps:[...baseline.map(t=>({...t})),tap(2,10,20),tap(3,10,30)],processes:[helper,app,aux],resource:{pid:10,group:9},targets,baselineTaps:baseline.map(t=>({...t})),requireTargets:true})
test('classifies exact retained filters without claiming release or physical safety',()=>{
 const result=admitKeeperFilters(spec());assert.equal(result.filters.length,2);assert.equal(result.nativeInputReleaseAssessed,false);assert.equal(result.physicalInputSafetyAssessed,false)
})
test('foreign helpers, unexplained targets and changed live targets refuse',()=>{
 for(const alter of [s=>s.processes.push({...helper,pid:11}),s=>s.taps[1].ownerPid=11,s=>s.taps[1].targetPid=99,s=>s.processes[1]={...app,path:'/changed'},s=>s.targets[1]={...s.targets[1],path:'/another-auxiliary'}]){
  const s=structuredClone(spec());alter(s);assert.throws(()=>admitKeeperFilters(s))
 }
})
test('duplicate tap/target filters and missing or changed baseline taps refuse',()=>{
 for(const alter of [s=>s.taps.push(tap(4,10,20)),s=>s.taps.push({...s.taps[1]}),s=>s.taps.shift(),s=>s.taps[0].mask='1',s=>s.taps.pop()]){
  const s=structuredClone(spec());alter(s);assert.throws(()=>admitKeeperFilters(s))
 }
})
test('inventory-only baseline permits zero retained filters but not unexplained interception',()=>{
 const s=spec();s.taps=[...baseline];s.requireTargets=false;assert.equal(admitKeeperFilters(s).filters.length,0)
 s.taps.push(tap(4,99,20));assert.throws(()=>admitKeeperFilters(s),/foreign or unexplained/)
})
