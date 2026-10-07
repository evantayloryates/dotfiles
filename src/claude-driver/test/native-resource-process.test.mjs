import test from 'node:test'
import assert from 'node:assert/strict'
import {observeNativeResourceProcess as observe,inspectNativeResourcePid} from '../lib/native-resource-process.mjs'
import {buildNativeResourceProgram} from '../lib/native-resource-program.mjs'
const config={resourceProbe:true,id:'a'.repeat(32),deadline:100000,brokerCwd:'/Users/taylor/.local/state/claude-driver/broker'}
const start='Thu Jan  1 00:00:01 1970',ready={serviceId:config.id,pid:123,ppid:456,startedAt:new Date(1500).toISOString()},epoch={pid:789,procStart:start}
const command=['/opt/homebrew/bin/node','--input-type=module','-e',buildNativeResourceProgram({serviceId:config.id,deadline:130000,evidenceRoot:config.brokerCwd})].join(' ')
const rows={123:{pid:123,ppid:456,procStart:start},456:{pid:456,ppid:789,procStart:start},789:{pid:789,ppid:1,procStart:start}}
test('process observation binds exact argv and native ancestor without exposing argv',()=>{
 const result=observe({config,ready,epoch},(pid,opts)=>opts?.command?command:rows[pid]??null)
 assert.equal(observe({config,ready,epoch},(pid,opts)=>opts?.command?command.replaceAll('\n','\\012'):rows[pid]??null).ownershipVerified,true);
 assert.equal(result.ownershipVerified,true);assert.equal(result.ancestry.length,2);assert.equal(JSON.stringify(result).includes('writeFileSync'),false)
})
test('foreign command, changed parent, stale native epoch and missing ancestry refuse',()=>{
 for(const inspect of [(pid,o)=>o?.command?'foreign':rows[pid],(pid,o)=>o?.command?command:pid===123?{...rows[123],ppid:999}:rows[pid],(pid,o)=>o?.command?command:pid===789?{...rows[789],procStart:'stale'}:rows[pid],(pid,o)=>o?.command?command:pid===456?null:rows[pid]])assert.throws(()=>observe({config,ready,epoch},inspect))
 assert.equal(observe({config,ready,epoch},()=>null).ownershipVerified,false)
})
test('real PID-scoped process metadata read identifies the test process',()=>{
 assert.equal(inspectNativeResourcePid(process.pid).pid,process.pid)
 assert.throws(()=>inspectNativeResourcePid(0))
})
