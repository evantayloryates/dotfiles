#!/usr/bin/env node
// Exact installed routing fragments only. No URL dispatch, IPC or app state.
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {join} from 'node:path'
import {installedDesktopChunk} from '../lib/installed-desktop-source.mjs'
import {STATE_DIR,writeJsonAtomic} from '../lib/state.mjs'
import {versions} from '../lib/paths.mjs'
const member='.vite/build/index.chunk-muI2IV6k.js',expected='4a8f1c07e69231e47127d3c55fcdda84eddb089ce06d347ad29591e25b6fb5f5',rows=[]
const out={scope:'installed-desktop-deeplink-static-contract',versions:versions(),nativeEffectsRequested:0,rows,ok:false,limitations:['Static exact installed handler fragments only','Renderer navigation may cause downstream warm lifecycle effects','No claim of process startup, absence of all possible ingress, or actual account feature gates']}
try{
 const s=installedDesktopChunk('/Applications/Claude.app/Contents/Resources/app.asar',member,{maxBytes:8*1024*1024});assert.equal(s.sha256,expected)
 const fragment=(a,b,max)=>{const start=s.text.indexOf(a),end=s.text.indexOf(b,start);assert.ok(start>0&&end>start&&end-start<max);return s.text.slice(start,end)}
 const resume=fragment('case Ml.Resume:{','case jl.Login:',2000),entry=fragment('async function tQn','var nQn=',1500),lookup=fragment('async function oQn','async function sQn',1500)
 const check=(name,condition)=>{assert.ok(condition);rows.push({name,ok:true})}
 check('resume-reads-session-id-and-imports-existing-cli-session',resume.includes('searchParams.get("session")')&&resume.includes('t.importCliSession(e)'))
 check('resume-fragment-has-no-prompt-send-or-start-call',!/(searchParams.get\("(?:q|prompt)"\)|sendMessage\(|sendPeerMessage\(|startSession\()/.test(resume))
 check('continue-entry-is-gated-and-navigates-resolved-route',entry.includes('if(!await RXn())')&&entry.includes('await oQn(t??"last")')&&entry.includes('mR(o??"/epitaxy",r,i)'))
 check('continue-lookup-selects-saved-unarchived-record-route',lookup.includes('getAllSessions()')&&lookup.includes('!e.isArchived')&&lookup.includes('t.getSessionRoute(r.sessionId)'))
 out.source={member,sha256:s.sha256,fragments:Object.fromEntries(Object.entries({resume,entry,lookup}).map(([k,v])=>[k,createHash('sha256').update(v).digest('hex')]))}
 assert.equal(installedDesktopChunk('/Applications/Claude.app/Contents/Resources/app.asar',member,{maxBytes:8*1024*1024}).sha256,s.sha256);out.ok=true
}catch{out.failureCategory='installed-deeplink-contract-unqualified'}
const report=join(STATE_DIR,'pressure','native-deeplink-contract-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json');writeJsonAtomic(report,out);console.log(JSON.stringify({report,ok:out.ok,checks:rows.length,nativeEffectsRequested:0}));process.exitCode=out.ok?0:1
