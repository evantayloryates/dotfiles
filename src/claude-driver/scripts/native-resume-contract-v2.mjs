#!/usr/bin/env node
// Exact installed source on synthetic records. No application IPC, URL dispatch,
// sessions, inference, credentials, permission or live actor changes.
import {runInNewContext} from 'node:vm'
import {createHash} from 'node:crypto'
import assert from 'node:assert/strict'
import {join} from 'node:path'
import {installedDesktopChunk} from '../lib/installed-desktop-source.mjs'
import {STATE_DIR,writeJsonAtomic} from '../lib/state.mjs'
import {versions} from '../lib/paths.mjs'
import {recordMemory} from '../lib/memory.mjs'
const report=join(STATE_DIR,'pressure','native-resume-contract-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json'),rows=[],hash=x=>createHash('sha256').update(x).digest('hex')
const out={scope:'installed-desktop-unarchive-and-owned-import-contract',versions:versions(),rows,ok:false,nativeEffectsRequested:0,limitations:['Extracted installed method with synthetic records and stubbed external dependencies','Warm lifecycle registration can have downstream effects; this does not prove process startup or its absence','No live import, native readiness, workspace trust, account access or both-controller recovery qualified']}
try{
 const source=installedDesktopChunk('/Applications/Claude.app/Contents/Resources/app.asar','.vite/build/index.chunk-CFJssAFf.js',{maxBytes:3*1024*1024})
 assert.equal(source.sha256,'abff2bf8cd6fa8d3d18964636ebaa6034e93997a9eea16a8802eaec0f759c9b7')
 const start=source.text.indexOf('unarchiveSession(e){'),end=source.text.indexOf('async restoreRemoteCwdBeforeSpawn(',start);assert.ok(start>0&&end>start&&end-start<4096)
 const method=source.text.slice(start,end),existingStart=source.text.indexOf('let u=this.sessions.get(o);if(u)return',source.text.indexOf('async adoptCliSession(')),existingEnd=source.text.indexOf(';let d=',existingStart)
 assert.ok(existingStart>0&&existingEnd>existingStart&&existingEnd-existingStart<1024)
 const existing=source.text.slice(existingStart,existingEnd);assert.ok(existing.includes('this.unarchiveSession(o)'));assert.ok(existing.endsWith(',o'))
 out.source={member:source.member,sha256:source.sha256,unarchiveMethodSha256:hash(method),existingImportBranchSha256:hash(existing)}
 const calls=[],native=runInNewContext('({'+method+'})',{Date,nw:()=>calls.push('normalize'),RV:()=>calls.push('transcript-index'),t:{p5:{info:()=>{}}}},{timeout:1000,contextCodeGeneration:{strings:false,wasm:false}}).unarchiveSession
 const context=record=>({sessions:new Map(record?[['owned',record]]:[]),diskTranscript:{},warmLifecycle:{registerSession:id=>calls.push('warm:'+id)},previewIdleManager:{registerSession:id=>calls.push('preview:'+id)},saveSession:()=>calls.push('save'),sessionClearing:{discardWaitingInputRecord:()=>calls.push('clear-waiting-input')},sessionViewRecord:{formatSessionForEvent:r=>({sessionId:r.sessionId})},emit:(_event,payload)=>calls.push('emit:'+payload.type),linkedFamilyRoster:{attachedParentIdOf:()=>undefined},remoteWorktreeRecreator:{ensureRemoteWorktree:()=>calls.push('remote-worktree-check'),ensureRemoteFolderWorktrees:()=>calls.push('remote-folder-check')}})
 const check=(name,fn)=>{calls.length=0;fn();rows.push({name,ok:true})}
 check('missing stored session does not register warm lifecycle',()=>{native.call(context(), 'owned');assert.deepEqual(calls,[])})
 check('already-active imported record is an unarchive no-op',()=>{const r={sessionId:'owned',isArchived:false};native.call(context(r),'owned');assert.deepEqual(calls,[]);assert.equal(r.isArchived,false)})
 check('archived record requests warm lifecycle and saves metadata; startup still unassessed',()=>{const r={sessionId:'owned',isArchived:true,cliSessionId:'owned-cli'};native.call(context(r),'owned');assert.equal(r.isArchived,false);assert.equal(r.unarchivedCliSessionId,'owned-cli');assert.ok(calls.includes('warm:owned'));assert.ok(calls.includes('save'));assert.ok(calls.includes('emit:unarchived'))})
 const current=installedDesktopChunk('/Applications/Claude.app/Contents/Resources/app.asar',source.member,{maxBytes:3*1024*1024});assert.equal(current.sha256,source.sha256)
 out.ok=true
}catch{out.failureCategory='installed-resume-contract-unqualified'}
writeJsonAtomic(report,out)
recordMemory({kind:'test_result',topic:'native-resume-bootstrap-contract',source:'installed-desktop-synthetic-method',status:out.ok?'passed':'failed',evidence:report,lesson:'Existing import delegates to unarchive; already-active record is a no-op there, archived record requests warm lifecycle. Never infer new native process, readiness or serving from import success.'})
console.log(JSON.stringify({report,ok:out.ok,checks:rows.length,failureCategory:out.failureCategory??null,nativeEffectsRequested:0}));process.exitCode=out.ok?0:1
