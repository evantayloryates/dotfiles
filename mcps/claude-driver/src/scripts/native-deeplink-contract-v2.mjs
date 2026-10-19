#!/usr/bin/env node
// Exact installed routing fragments only. No URL dispatch, IPC or app state.
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {join} from 'node:path'
import {constants,openSync,fstatSync,readFileSync,closeSync} from 'node:fs'
import {installedDesktopChunk} from '../lib/installed-desktop-source.mjs'
import {STATE_DIR,writeJsonAtomic} from '../lib/state.mjs'
import {versions,resolveClaudeBinary} from '../lib/paths.mjs'
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
 // The supported --desktop wrapper is another caller of this same resume URL,
 // not a new prompt/start ingress. Inspect shipped public code, never execute it.
 assert.equal(out.versions.cli,'2.1.299')
 const fd=openSync(resolveClaudeBinary(),constants.O_RDONLY|constants.O_NOFOLLOW)
 let cli
 try{
  const before=fstatSync(fd);assert.ok(before.isFile()&&before.size>0&&before.size<=256*1024*1024)
  cli=readFileSync(fd).toString('utf8');const after=fstatSync(fd)
  for(const key of ['dev','ino','size','mtimeMs','ctimeMs'])assert.equal(after[key],before[key])
 }finally{closeSync(fd)}
 const cliFragment=(a,b,sha)=>{const start=cli.indexOf(a),end=cli.indexOf(b,start);assert.ok(start>0&&end>start&&end-start<1000);const text=cli.slice(start,end);assert.equal(createHash('sha256').update(text).digest('hex'),sha);return text}
 const route=cliFragment('function a(e,n,o={}){let r=new URL(`${e}://${n}`);','var p={appPath:','131de5ed2b0f414df19ce41733c5145979bdb67d26e8611f807449d1fe0ecff0')
 const launch=cliFragment('async function dVr(e){let n=await lVr()','async function f5o()','1ffcc3ee2ba5ed3871a07de932853b081d2f0d720c698c54e96dc804c960e442')
 const opener=cliFragment('async function w(e,n){t(`Opening deep link:','function dwt(e)','acadeee190943b2df80b66cba0fc630407ad3cb031a72e04065c7636e72ed880')
 check('cli-desktop-resume-builds-existing-resume-link',route.includes('case"resume":return a(n,"resume",{session:e.sessionId})'))
 check('cli-desktop-launch-only-delegates-to-link-opener',launch.includes('let o=y(e,n.scheme),r=await w(o,n.macApp)')&&opener.includes('await nt("open",r.openByPath?["-a",r.appPath,e]:[e])'))
 out.cliSource={version:out.versions.cli,fragments:Object.fromEntries(Object.entries({route,launch,opener}).map(([k,v])=>[k,createHash('sha256').update(v).digest('hex')])),sameResumeIngress:true}
 out.source={member,sha256:s.sha256,fragments:Object.fromEntries(Object.entries({resume,entry,lookup}).map(([k,v])=>[k,createHash('sha256').update(v).digest('hex')]))}
 assert.equal(installedDesktopChunk('/Applications/Claude.app/Contents/Resources/app.asar',member,{maxBytes:8*1024*1024}).sha256,s.sha256);out.ok=true
}catch{out.failureCategory='installed-deeplink-contract-unqualified'}
const report=join(STATE_DIR,'pressure','native-deeplink-contract-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json');writeJsonAtomic(report,out);console.log(JSON.stringify({report,ok:out.ok,checks:rows.length,nativeEffectsRequested:0}));process.exitCode=out.ok?0:1
