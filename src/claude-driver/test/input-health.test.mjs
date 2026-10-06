import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const root=mkdtempSync(join(tmpdir(),'claude-input-health-'))
process.env.CLAUDE_DRIVER_STATE_DIR=root
const {survivingClaudeFilters,assertInputHealthy}=await import('../lib/input-health.mjs')
const {readJson,writeJsonAtomic}=await import('../lib/state.mjs')
const {UI_QUARANTINE}=await import('../lib/ui-policy.mjs')
const processes='42 /Users/test/.codex/computer-use/Codex Computer Use.app/Contents/MacOS/SkyComputerUseService\n7 /Applications/Claude.app/Contents/MacOS/Claude\n8 /Applications/Other.app/Contents/MacOS/Other\n99 /Applications/Other.app/Contents/MacOS/SkyComputerUseService'
const tap={tapId:1,ownerPid:42,targetPid:7,enabled:true,options:0,mask:'7168'}
test('detects only active helper keyboard filters for Claude, including single survivors',()=>{
 assert.deepEqual(survivingClaudeFilters([tap,{...tap,tapId:2}],processes).map(x=>x.tapId),[1,2])
 const irrelevant=[{...tap,enabled:false},{...tap,options:1},{...tap,mask:'1581056'},{...tap,targetPid:8},{...tap,ownerPid:99}]
 assert.deepEqual(survivingClaudeFilters(irrelevant,processes),[])
 assert.throws(()=>survivingClaudeFilters([{...tap,mask:'broken'}],processes))
})
test('clean audit records evidence without releasing an existing human quarantine',async()=>{
 writeJsonAtomic(UI_QUARANTINE,{blocked:true,reason:'human incident',at:'original',source:'human'})
 const evidence=join(root,'clean.json')
 await assertInputHealthy({phase:'after-lease',evidence,audit:async()=>({at:'audit',filters:[]})})
 assert.equal(readJson(evidence).filters.length,0)
 assert.equal(readJson(UI_QUARANTINE).reason,'human incident')
})
test('a leaked filter quarantines further UI leases and preserves a human incident',async()=>{
 await assert.rejects(assertInputHealthy({phase:'after-lease',evidence:join(root,'leak.json'),audit:async()=>({filters:[tap]})}),e=>e.category==='ui_quarantined')
 const policy=readJson(UI_QUARANTINE)
 assert.equal(policy.blocked,true);assert.equal(policy.reason,'human incident');assert.equal(policy.at,'original')
 assert.equal(policy.inputHealth.filters,1)
})
test('audit failure fails closed and does not claim cleanup',async()=>{
 writeJsonAtomic(UI_QUARANTINE,{blocked:false})
 await assert.rejects(assertInputHealthy({phase:'before-lease',evidence:join(root,'failed.json'),audit:async()=>{throw new Error('synthetic failure')}}),e=>e.category==='ui_quarantined')
 assert.equal(readJson(UI_QUARANTINE).blocked,true)
 assert.match(readJson(UI_QUARANTINE).reason,/could not be verified/)
 assert.equal(readJson(join(root,'failed.json')).filters,undefined)
})
test.after(()=>rmSync(root,{recursive:true,force:true}))
