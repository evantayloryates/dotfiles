#!/usr/bin/env node
// Exact current dev-mod watcher with synthetic filesystem, clock and consent.
// No module publication, native consent interaction, app control or inference.
import assert from 'node:assert/strict'
import {runInNewContext,Script} from 'node:vm'
import {join} from 'node:path'
import {versions,resolveClaudeBinary} from '../lib/paths.mjs'
import {installedModuleContaining} from '../lib/installed-source.mjs'
import {STATE_DIR,writeJsonAtomic} from '../lib/state.mjs'
import {RUNTIME_BUILD} from '../lib/build.mjs'
import {recordMemory} from '../lib/memory.mjs'
const report=join(STATE_DIR,'pressure','mod-lifecycle-contract-299-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json'),rows=[];let failure,source
try{
 assert.equal(versions().cli,'2.1.299','unreviewed CLI version')
 const module=installedModuleContaining(resolveClaudeBinary(),'function No(o){try{return Ge(o'),a=module.text.indexOf('function Do(o,e)'),b=module.text.indexOf('var _o=',a);assert.ok(a>=0&&b>a,'watcher source changed');let body=module.text.slice(a,b);try{new Script(body)}catch{body=JSON.parse('"'+body+'"');new Script(body)}source={offset:module.offset,sha256:module.sha256,bytes:module.bytes}
 const watcher=runInNewContext(`(()=>{${body};return Do})()`,{AbortController,Promise,Number,Set,wo:3,t:()=>{},l:e=>e.message},{timeout:1000,contextCodeGeneration:{strings:false,wasm:false}})
 function fixture({answer='enable',refused=false,loaded=[]}={}){const timers=[],calls=[];let change,begin,end,running=false;const deps={loaded,watchRoot:(_root,fn)=>{change=fn;return {close:async()=>calls.push('watch-closed')}},turn:{onBegin:fn=>{begin=fn;return()=>{}},onEnd:fn=>{end=fn;return()=>{}},isRunning:()=>running,isPersonTurn:()=>true},clock:{setTimeout:fn=>{timers.push(fn);return()=>{} }},quietMs:1,listChildren:async()=>['receiver'],refusal:()=>refused,ask:async()=>{calls.push('ask');return answer},enable:async()=>calls.push('enable'),stopped:reason=>calls.push('stopped:'+reason),deferred:()=>calls.push('deferred'),withdrawn:()=>calls.push('withdrawn'),unanswered:()=>calls.push('unanswered')};const api=watcher('/synthetic/devmods',deps);return {api,calls,flush:async()=>{while(timers.length)timers.shift()();for(let i=0;i<30;i++)await Promise.resolve()},change:()=>change(),begin:()=>{running=true;begin()},end:()=>{running=false;end()}}}
 const check=async(name,fn)=>{await fn();rows.push({name,ok:true})}
 await check('new child asks before enabling; explicit enable invokes loader',async()=>{const x=fixture();await x.flush();assert.ok(x.calls.indexOf('ask')>=0);assert.ok(x.calls.indexOf('enable')>x.calls.indexOf('ask'));assert.ok(x.calls.includes('stopped:enabled'))})
 await check('no consent recipient or explicit decline never enables',async()=>{for(const answer of ['no_one_to_ask','decline']){const x=fixture({answer});await x.flush();assert.ok(x.calls.includes('ask'));assert.ok(!x.calls.includes('enable'));await x.api.dispose()}})
 await check('policy refusal closes watcher before asking or enabling',async()=>{const x=fixture({refused:true});await x.flush();assert.ok(!x.calls.includes('ask'));assert.ok(!x.calls.includes('enable'));assert.ok(x.calls.includes('stopped:refused'))})
 await check('already loaded child does not cause duplicate enable request',async()=>{const x=fixture({loaded:['receiver']});await x.flush();assert.ok(!x.calls.includes('ask'));assert.ok(!x.calls.includes('enable'));await x.api.dispose()})
}catch(e){failure=String(e.message).slice(0,500)}
const evidence={scope:'installed-2.1.299-dev-mod-consent-watcher-isolated',runtimeBuild:RUNTIME_BUILD,versions:versions(),source,rows,ok:!failure,...failure&&{failure},nativeCalls:0,modulesLoaded:0,limitations:['Consent, watcher, clock, turns and filesystem are synthetic','Does not establish actual scratch-session consent, session.receive registration, serving or module unload']};writeJsonAtomic(report,evidence);recordMemory({kind:'test_result',topic:'current-mod-lifecycle-contract',source:'installed-watcher-isolated',status:evidence.ok?'passed':'failed',evidence:report,lesson:'Exact2.1.299 watcher: new module asks before enable; no recipient/decline/policy refusal cannot enable; loaded child does not duplicate enable. Synthetic consent is not live authorization or module serving proof.'});console.log(JSON.stringify({report,...evidence}));process.exitCode=evidence.ok?0:1
