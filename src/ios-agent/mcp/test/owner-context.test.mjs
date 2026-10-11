import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {codexOwnerContext} from '../owner-context.mjs';
import {Backend} from '../backend.mjs';

const id='01a116ef-a3ad-74c3-ad32-6869c9c14e03';
function fixture(){
 const home=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ios-owner-')));
 const folder=path.join(home,'.codex/sessions/2026/10/07');fs.mkdirSync(folder,{recursive:true});
 const file=path.join(folder,'rollout-2026-10-07T12-00-00-'+id+'.jsonl');
 const write=(value=id)=>fs.writeFileSync(file,JSON.stringify({type:'session_meta',payload:{id:value}})+'\n'+JSON.stringify({type:'response_item',payload:{privateContent:'never-export'}})+'\n');
 return {home,file,folder,write,clean:()=>fs.rmSync(home,{recursive:true})};
}
test('binds only exact inherited Codex thread and matching metadata without exporting content',()=>{
 const f=fixture();try {f.write();const result=codexOwnerContext({home:f.home,env:{CODEX_THREAD_ID:id}});assert.deepEqual(result,{mode:'codex-turn',source:'inherited-thread',threadId:id,rollout:f.file});assert(!JSON.stringify(result).includes('never-export'));assert.equal(codexOwnerContext({home:f.home,env:{},threadId:id}).source,'explicit-thread');}finally{f.clean();}
});
test('missing, malformed, mismatched, duplicate and symlink rollouts never select another owner',()=>{
 const f=fixture();try {
  const read=(value=id)=>codexOwnerContext({home:f.home,env:{CODEX_THREAD_ID:value}});
  assert.equal(codexOwnerContext({home:f.home,env:{}}).mode,'mcp-connection');
  assert.equal(read('../escape').mode,'mcp-connection');assert.equal(read().reason,'codex_rollout_not_found');
  f.write('different');assert.equal(read().mode,'mcp-connection');
  f.write();fs.copyFileSync(f.file,path.join(f.folder,'rollout-duplicate-'+id+'.jsonl'));assert.equal(read().reason,'ambiguous_codex_rollout');
  fs.unlinkSync(path.join(f.folder,'rollout-duplicate-'+id+'.jsonl'));fs.renameSync(f.file,f.file+'.real');fs.symlinkSync(f.file+'.real',f.file);assert.equal(read().mode,'mcp-connection');
 }finally{f.clean();}
});
test('inherited owner is sent with independent connection guard; explicit rollout wins',async()=>{
 const state=fs.mkdtempSync(path.join(os.tmpdir(),'ios-owner-backend-')),calls=[];
 const backend=new Backend({state,ownerContext:()=>({mode:'codex-turn',source:'inherited-thread',threadId:id,rollout:'/exact/rollout.jsonl'}),run:async(kind,args)=>{calls.push(args);return {ok:true,value:{}};}});
 try{
  const first=await backend.begin({surface:'launch'});assert.equal(first.lifecycle.threadId,id);assert(calls[0].includes('--connection-owner'));assert.equal(calls[0][calls[0].indexOf('--rollout')+1],'/exact/rollout.jsonl');await backend.end(first.sessionId);
  const second=await backend.begin({surface:'launch',rollout:'/explicit/rollout.jsonl'});const acquire=calls.findLast(a=>a[0]==='acquire');assert.equal(acquire[acquire.indexOf('--rollout')+1],'/explicit/rollout.jsonl');assert.equal(second.lifecycle.source,'explicit-rollout');await backend.end(second.sessionId);
 }finally{await backend.close();fs.rmSync(state,{recursive:true});}
});

test('explicit missing thread refuses before any broker admission or directory creation',async()=>{
 const state=fs.mkdtempSync(path.join(os.tmpdir(),'ios-owner-refusal-'));let calls=0;
 const backend=new Backend({state,ownerContext:()=>({mode:'mcp-connection',reason:'codex_rollout_not_found'}),run:async()=>{calls++;return {ok:true};}});
 try{await assert.rejects(backend.begin({threadId:id}),/codex_rollout_not_found/);assert.equal(calls,0);assert.equal(backend.sessions.size,0);await assert.rejects(backend.begin({threadId:id,rollout:'/other'}),/one_codex_owner_reference_required/);assert.equal(calls,0);}finally{await backend.close();fs.rmSync(state,{recursive:true});}
});

test('native state selects the resumed exact thread and never falls back to its stale original',async()=>{
 const {DatabaseSync}=await import('node:sqlite');const f=fixture();let db;
 try{
  f.write();const current=path.join(f.folder,'rollout-resumed-'+id+'_01a1220a-8543-7013-8b22-9ad95ae0a889.jsonl');
  fs.copyFileSync(f.file,current);db=new DatabaseSync(path.join(f.home,'.codex/state_5.sqlite'));
  db.exec('CREATE TABLE threads (id TEXT PRIMARY KEY, rollout_path TEXT)');db.prepare('INSERT INTO threads VALUES (?,?)').run(id,current);
  const read=()=>codexOwnerContext({home:f.home,threadId:id,env:{}});
  assert.equal(read().rollout,current);fs.unlinkSync(current);assert.equal(read().reason,'codex_rollout_unavailable');
  db.prepare('UPDATE threads SET rollout_path=? WHERE id=?').run(f.file,id);f.write('other');assert.equal(read().mode,'mcp-connection');
  db.prepare('DELETE FROM threads WHERE id=?').run(id);assert.equal(read().reason,'codex_rollout_not_found');
 }finally{db?.close();f.clean();}
});
