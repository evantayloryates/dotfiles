import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {reserve,write,settle} from './autofix.mjs'
import {archiveOnce} from './autofix-archive.mjs'
import {ROOT} from './recovery-dispatch.mjs'
function fixture(){
 const base=mkdtempSync(join(tmpdir(),'archive-fixture-')),i=reserve({base}),id='11111111-1111-1111-1111-111111111111'
 write(join(i.dir,'incident.json'),{...i,dir:undefined,threadId:id})
 writeFileSync(join(i.dir,'artifacts/verified.json'),'{}')
 write(join(i.dir,'report.json'),{outcome:'no_change',headline:'Healthy',summary:'Healthy',cause:'Normal lock',resolution:'No change',verification:'Readback',activation:'Running',limitations:'None',docs:'Reviewed',docsReviewed:true,verified:true,artifacts:['artifacts/verified.json']});settle(i.dir,{base})
 const f={base,dir:i.dir,status:'idle',ready:true,archived:false,calls:[],title:i.title}
 f.peer={async request(m,a){f.calls.push(m);if(m==='thread/list')return {data:f.archived?[{id}]:[]};if(m==='thread/read')return {thread:{id,name:f.title,cwd:ROOT,status:{type:f.status},turns:[{status:'completed'}]}};if(m==='thread/archive'){f.archived=true;return {}};throw Error(m)}}
 f.run=()=>archiveOnce(i.dir,{base,peer:f.peer,ready:()=>f.ready});f.clean=()=>rmSync(base,{recursive:true,force:true});return f
}
test('idle verified pushed incident archives and reads back',async()=>{const f=fixture();try{assert.equal((await f.run()).status,'archived');assert.equal(f.calls.filter(m=>m==='thread/archive').length,1);assert.equal((await f.run()).alreadyArchived,true);assert.equal(f.calls.filter(m=>m==='thread/archive').length,1)}finally{f.clean()}})
test('active turn is never interrupted',async()=>{const f=fixture();try{f.status='active';assert.equal((await f.run()).status,'waiting_for_turn');assert.ok(!f.calls.includes('thread/archive'))}finally{f.clean()}})
test('dirty or unpushed changes defer archive',async()=>{const f=fixture();try{f.ready=false;assert.equal((await f.run()).status,'waiting_for_commit_push');assert.ok(!f.calls.includes('thread/archive'))}finally{f.clean()}})
test('identity mismatch refuses archive',async()=>{const f=fixture();try{f.title='Other chat';await assert.rejects(f.run(),/identity/);assert.ok(!f.calls.includes('thread/archive'))}finally{f.clean()}})
test('edited evidence refuses archive',async()=>{const f=fixture();try{writeFileSync(join(f.dir,'artifacts/verified.json'),'changed');await assert.rejects(f.run(),/not verifiably settled/);assert.equal(f.calls.length,0)}finally{f.clean()}})
