import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,writeFileSync,appendFileSync,rmSync,symlinkSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {nativeLifecycleLine,collectNativeLifecycle} from '../src/lib/native-lifecycle.mjs'
const sid='local_00000000-0000-4000-8000-000000000001'
const line=`2026-10-15 12:34:56 [error] Session ${sid} query error: Claude Code process exited with code 143 PRIVATE_STACK\n`
test('exit143 remains unattributed; unrelated sessions and raw text are excluded',()=>{
 const event=nativeLifecycleLine(line,sid)
 assert.equal(event.exitCode,143);assert.equal(event.cause,'unknown');assert.equal(JSON.stringify(event).includes('PRIVATE'),false)
 assert.equal(nativeLifecycleLine(line,sid.replace(/1$/,'2')),null)
 assert.equal(nativeLifecycleLine(line,sid+'suffix'),null)
 assert.equal(nativeLifecycleLine(`2026-10-15 12:34:56 [CliGovernor] at cap=8; would evict ${sid} (idle 53s)`,sid).kind,'owned-governor-eviction-intent')
})
test('cursor deduplicates polls, preserves partial records, reports coverage gaps and refuses symlinks',()=>{
 const dir=mkdtempSync(join(tmpdir(),'native-lifecycle-')),file=join(dir,'main.log')
 try{
  writeFileSync(file,line);const first=collectNativeLifecycle({file,sessionId:sid});assert.equal(first.events.length,1);assert.equal(first.gap,'initial-tail-only')
  const next=collectNativeLifecycle({file,sessionId:sid,cursor:first.cursor});assert.equal(next.events.length,0);assert.equal(next.gap,null)
  appendFileSync(file,line.slice(0,-1));const partial=collectNativeLifecycle({file,sessionId:sid,cursor:next.cursor});assert.equal(partial.events.length,0)
  appendFileSync(file,'\n');const full=collectNativeLifecycle({file,sessionId:sid,cursor:partial.cursor});assert.equal(full.events.length,1)
  writeFileSync(file,'');assert.equal(collectNativeLifecycle({file,sessionId:sid,cursor:full.cursor}).gap,'rotation-truncation-or-identity-change')
  symlinkSync(file,join(dir,'link'));assert.equal(collectNativeLifecycle({file:join(dir,'link'),sessionId:sid}).available,false)
 }finally{rmSync(dir,{recursive:true,force:true})}
})
