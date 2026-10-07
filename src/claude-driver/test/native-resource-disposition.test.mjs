import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {buildNativeResourceProgram} from '../lib/native-resource-program.mjs'
import {reviewNativeResourceDisposition as review} from '../lib/native-resource-disposition.mjs'
const iso=n=>new Date(n).toISOString()
function fixture(){
 const config={id:'a'.repeat(32),marker:true,resourceProbe:true,brokerCwd:'/Users/taylor/.local/state/claude-driver/broker',notBefore:1000,deadline:61000},epoch={pid:789,procStart:'Thu Jan  1 00:00:00 1970'}
 const ready={schemaVersion:1,scope:'owned-native-resource',serviceId:config.id,pid:123,ppid:789,startedAt:iso(1250),selfDeadline:91000}
 const command=['/opt/homebrew/bin/node','--input-type=module','-e',buildNativeResourceProgram({serviceId:config.id,deadline:91000,evidenceRoot:config.brokerCwd})].join(' ')
 const row={state:'alive',ownershipVerified:true,pid:123,ppid:789,procStart:'Thu Jan  1 00:00:01 1970',commandSha256:createHash('sha256').update(command).digest('hex'),ancestry:[{pid:789,ppid:1,procStart:epoch.procStart}]}
 return {config,epoch,ready,intent:{schemaVersion:1,serviceId:config.id,attemptedAt:iso(1000),selfDeadline:91000,modelCallsRequested:0},exit:{...ready,reason:'SIGTERM',code:143,exitedAt:iso(62500)},observations:[{...row,observedAt:iso(2000)},{...row,observedAt:iso(61900)}],retirement:{serviceId:config.id,filesRetired:true,at:iso(62000)},absent:{state:'absent',pid:123,observedAt:iso(63000)},now:64000}
}
test('exact child disposition qualifies only narrow resource cleanup',()=>{
 const r=review(fixture());assert.equal(r.resourceDisposalQualified,true);assert.equal(r.exitDelayMs,500);assert.equal(r.scopedUnloadQualified,false);assert.equal(r.releaseAuthorized,false)
})
test('self-timeout, pre-retirement exit, unowned observation and stale/absent evidence refuse',()=>{
 const cases=[f=>{f.exit.reason='deadline';f.exit.code=0;f.exit.exitedAt=iso(91000);f.now=92000},f=>{f.exit.exitedAt=iso(61500)},f=>{f.observations[1].commandSha256='b'.repeat(64)},f=>{f.observations[1].ownershipVerified=false},f=>{f.observations[1].observedAt=iso(50000)},f=>{f.absent.state='alive'},f=>{f.absent.observedAt=iso(62000)},f=>{f.observations[1].ancestry=[{pid:789,ppid:1,procStart:'stale'}]},f=>{f.retirement.serviceId='foreign'}]
 for(const mutate of cases){const f=fixture();mutate(f);assert.equal(review(f).resourceDisposalQualified,false)}
})
