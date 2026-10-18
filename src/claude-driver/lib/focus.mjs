// Focus policy (Taylor's hard rule): snapshot immediately before every
// navigating op, never reuse a snapshot across ops, and after the op restore
// only if the main window still shows what the op navigated to. If Taylor
// moved meanwhile, leave it alone. Then give the front back to whatever app
// was frontmost if it was not Claude.
//
// Modes: "restore" (default), "show" (leave the result in view, Claude in
// front), "leave" (do nothing after the op).
//
// Which session the main window shows comes from main.log's
// "LocalSessions.setFocusedSession: sessionId=…" lines (exact and
// timestamped), falling back to the pane store / lastFocusedAt on disk.
// Both matched get_window_layout; see docs/findings.md.

import { closeSync, openSync, readSync, statSync } from 'node:fs'

import { CLAUDE_BUNDLE_ID, MAIN_LOG, openUrl, sh, sleep } from './paths.mjs'
import { diskFocus } from './sessions.mjs'

export const FOCUS_MODES = ['restore', 'show', 'leave']

export async function frontApp() {
  try {
    const asn = (await sh('/usr/bin/lsappinfo', ['front'])).trim()
    const info = await sh('/usr/bin/lsappinfo', ['info', '-only', 'bundleid', asn])
    return info.match(/"CFBundleIdentifier"="([^"]+)"/)?.[1] || null
  } catch {
    return null
  }
}

export function sessionUrl(localId) {
  return `claude://claude.ai/epitaxy/${localId}`
}

export function tailFile(file, bytes = 96 * 1024) {
  let fd
  try {
    const size = statSync(file).size
    const start = Math.max(0, size - bytes)
    const buf = Buffer.alloc(size - start)
    fd = openSync(file, 'r')
    readSync(fd, buf, 0, buf.length, start)
    return buf.toString('utf8')
  } catch {
    return ''
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

const logTime = (line) => {
  const m = line.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})/)
  return m ? new Date(`${m[1]}T${m[2]}`).getTime() : 0
}

// Latest non-null focused session per main.log, or null if none in the tail.
export function logFocus() {
  const lines = tailFile(MAIN_LOG).split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(/LocalSessions\.setFocusedSession: sessionId=(local_[0-9a-f-]+)/)
    if (m) return { sessionId: m[1], at: logTime(lines[i]) }
  }
  return null
}

// main.log lines since a wall-clock time (second resolution), for signals like
// "[CliGovernor] at cap; yielding warm spawn".
export function logSince(sinceMs, pattern) {
  const floor = Math.floor(sinceMs / 1000) * 1000
  return tailFile(MAIN_LOG)
    .split('\n')
    .filter((l) => logTime(l) >= floor && (!pattern || pattern.test(l)))
}

export function currentMain() {
  const lf = logFocus()
  if (lf) return { sessionId: lf.sessionId, source: 'main.log' }
  const d = diskFocus()
  return { sessionId: d.primarySession || d.lastFocused?.sessionId || null, source: 'disk' }
}

export async function snapshot() {
  const app = await frontApp()
  const main = currentMain()
  return { at: Date.now(), frontApp: app, mainSession: main.sessionId, source: main.source }
}

async function waitMain(target, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let cur = null
  while (Date.now() < deadline) {
    cur = currentMain().sessionId
    if (cur === target) return cur
    await sleep(150)
  }
  return cur
}

// Separate policy orchestration from native I/O so failure and user-intervention
// paths can be exercised without activating real applications.
export async function restoreFocusPolicy(before,target,d){
  const now=await d.waitMain(target),actions=[]
  let verified=typeof before.mainSession==='string'&&before.mainSession.length>0&&typeof before.frontApp==='string'&&before.frontApp.length>0
  if(!verified)actions.push('original focus snapshot unavailable (not confirmed)')
  const moved=now!==target&&now!==before.mainSession
  if(now===target&&before.mainSession&&before.mainSession!==target){
    let landed=false
    try{await d.navigate(before.mainSession);landed=await d.waitMain(before.mainSession)===before.mainSession}catch{}
    verified=verified&&landed
    actions.push(`main window → ${before.mainSession}${landed?'':' (not confirmed)'}`)
  }else if(moved){actions.push(`left alone: main window shows ${now}, not the op's target (Taylor moved)`);verified=verified&&typeof now==='string'&&now.length>0}
  else if(now!==target)actions.push('main window never moved to the target')
  if(!moved&&before.frontApp&&before.frontApp!==CLAUDE_BUNDLE_ID){
    const front=await d.frontApp()
    if(front===CLAUDE_BUNDLE_ID){
      let landed=false
      try{await d.activate(before.frontApp);landed=await d.waitFront(before.frontApp)===before.frontApp}catch{}
      verified=verified&&landed;actions.push(`front app → ${before.frontApp}${landed?'':' (not confirmed)'}`)
    }else if(front!==before.frontApp){actions.push(`front app left alone: ${front}`);verified=verified&&typeof front==='string'&&front.length>0}
  }
  return {action:actions.join('; ')||'nothing to restore',verified,navigationObserved:now===target,disposition:moved?'user-moved':'restore-observed'}
}
async function waitFront(target,timeoutMs){
 const deadline=Date.now()+timeoutMs;let current=null
 do{current=await frontApp();if(current===target)return current;await sleep(100)}while(Date.now()<deadline)
 return current
}
export async function restoreFrom(before,target,{settleMs=3000,...opts}={}){
 const result=await restoreFocusPolicy(before,target,{waitMain:t=>waitMain(t,settleMs),navigate:t=>openUrl(sessionUrl(t)),frontApp,activate:app=>sh('/usr/bin/open',['-b',app]),waitFront:t=>waitFront(t,settleMs)})
 return opts.evidence?result:result.action
}

// A metadata result without a navigation receipt cannot authorize restoration.
// Compare fresh observations instead; a changed view remains unattributed and
// untouched. Equality proves observed endpoints, never uninterrupted focus.
export function observeFocusPreservation(before,after){
 const known=x=>x&&Number.isSafeInteger(x.at)&&x.at>=0&&typeof x.mainSession==='string'&&x.mainSession.length>0&&typeof x.frontApp==='string'&&x.frontApp.length>0&&['main.log','disk'].includes(x.source)
 const qualified=known(before)&&known(after)&&after.at>=before.at
 const unchanged=qualified&&before.mainSession===after.mainSession&&before.frontApp===after.frontApp
 return {action:unchanged?'focus endpoints unchanged':qualified?'focus changed; left untouched (cause unassessed)':'focus observation unavailable (not confirmed)',verified:unchanged,disposition:unchanged?'unchanged-observed':qualified?'changed-unattributed':'observation-unavailable',observationScope:'before-after-endpoints',before,after}
}
export async function runObservedFocusOperation(fn,d){
 const before=await d.snapshot()
 try{const result=await fn();return {result,focus:observeFocusPreservation(before,await d.snapshot())}}
 catch(error){try{error.focusObservation=observeFocusPreservation(before,await d.snapshot());error.detail={...error.detail,focusObservation:error.focusObservation}}catch{}throw error}
}

// Run fn (which returns { navigatedTo, ... }) under a focus mode.
export async function runNavigatingFocusOperation(mode,fn,opts,d){
 if(!FOCUS_MODES.includes(mode))mode='restore'
 if(opts.observeUnchanged===true&&mode==='restore')return runObservedFocusOperation(fn,{snapshot:d.snapshot})
 const before=mode==='leave'?null:await d.snapshot()
 let result,navigationTarget=opts.target??null
 const navigationIntent=target=>{if(!/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(target||''))throw Error('invalid navigation target');navigationTarget=target}
 try{result=await fn({navigationIntent})}catch(error){
  if(mode==='restore'&&navigationTarget){try{const restoration=await d.restore(before,navigationTarget,{...opts,evidence:true});error.focusRestoration=restoration;error.detail={...error.detail,focusRestoration:restoration}}catch{error.focusRestoration={verified:false,action:'restoration failed (not confirmed)'}}}
  throw error
 }
 const target=result?.navigatedTo||null
 if(mode==='leave'||!target)return {result,focus:{mode,before,action:'none',verified:null}}
 if(mode==='show'){
  const landed=await d.waitMain(target,opts.settleMs??3000)===target
  return {result,focus:{mode,before,action:landed?'shown':'shown (not confirmed)',target,verified:landed,navigationObserved:landed}}
 }
 const restoration=await d.restore(before,target,{...opts,evidence:true})
 return {result,focus:{mode,before,...restoration,target}}
}

export async function withFocus(mode='restore',fn,opts={}){
 return runNavigatingFocusOperation(mode,fn,opts,{snapshot,restore:restoreFrom,waitMain})
}
