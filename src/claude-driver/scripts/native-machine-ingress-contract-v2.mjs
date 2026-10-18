#!/usr/bin/env node
// Read-only installed-source boundary evidence. No IPC, tool invocation, auth
// material, whole-bundle execution or feature-flag changes.
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {join} from 'node:path'
import {installedDesktopChunk} from '../lib/installed-desktop-source.mjs'
import {versions} from '../lib/paths.mjs'
import {STATE_DIR,writeJsonAtomic} from '../lib/state.mjs'
import {recordMemory} from '../lib/memory.mjs'
const member='.vite/build/index.chunk-B5tintml.js',expected='f5d162e3e6047c12ca0cee15d72574e316513df6a65d52e89e2d456a4a3022ff',rows=[]
const out={scope:'installed-native-machine-ingress-static-contract',versions:versions(),rows,nativeEffectsRequested:0,ok:false,limitations:['Static exact-source assertions, no runtime account feature-flag assessment','Does not prove all possible app ingress routes absent','No live tool calls, process startup or app-restart qualification']}
try{
 const s=installedDesktopChunk('/Applications/Claude.app/Contents/Resources/app.asar',member);assert.equal(s.sha256,expected);out.source={member,sha256:s.sha256}
 const start=s.text.indexOf('function Xf(){'),end=s.text.indexOf('var Zf=',start);assert.ok(start>0&&end>start&&end-start<20000);const router=s.text.slice(start,end)
 const check=(name,condition)=>{assert.ok(condition,name);rows.push({name,ok:true})}
 check('native-session-tools-enabled-for-ccd-context',router.includes('isEnabled:e=>e.sessionType==="ccd"'))
 const send=router.indexOf('await s.sendPeerMessage(');assert.ok(send>0);const fragment=router.slice(send,send+350)
 check('machine-tool-send-retains-peer-origin',fragment.includes('origin:{kind:"peer",from:i.sessionId'))
 check('machine-tool-send-reports-delivery-separately',router.includes('b.delivery==="undelivered"')&&router.includes('b.delivery==="queued"'))
 const startTool=s.text.indexOf('rx="start_session"');assert.ok(startTool>0);check('start-session-exposure-depends-on-account-gate',s.text.slice(startTool,startTool+350).includes('ux=()=>t.LZ("2371478310")'))
 out.source.routerSha256=createHash('sha256').update(router).digest('hex');out.ok=true
 assert.equal(installedDesktopChunk('/Applications/Claude.app/Contents/Resources/app.asar',member).sha256,s.sha256)
}catch{out.failureCategory='installed-machine-ingress-contract-unqualified';out.ok=false}
const report=join(STATE_DIR,'pressure','native-machine-ingress-contract-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json');writeJsonAtomic(report,out)
recordMemory({kind:'test_result',topic:'native-machine-ingress-contract',source:'installed-desktop-static-contract',status:out.ok?'passed':'failed',evidence:report,lesson:'Native session tool server requires ccd context and preserves peer-origin send. This does not establish a supported external bootstrap when every desktop Code process is absent; never spoof human origin or session context.'})
console.log(JSON.stringify({report,ok:out.ok,checks:rows.length,nativeEffectsRequested:0}));process.exitCode=out.ok?0:1
