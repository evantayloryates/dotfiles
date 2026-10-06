// Tier C: computer use through the existing codex-bridge engine in an
// isolated private worker, without modifying or restarting the shared daemon. Used for what neither disk, deep links nor ccd_* tools reach:
// broker revival when the app will not warm-spawn, window management, and
// UI-only affordances. Results are claims; callers verify through Tier A.

import {spawn} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {DriverError} from './paths.mjs'
import {assertUiAvailable} from './ui-policy.mjs'
import {STATE_DIR,ensureDir,withLock,writeJsonAtomic} from './state.mjs'
const WORKER=fileURLToPath(new URL('../scripts/tierc-worker.mjs',import.meta.url))

const POSTURE =
  'You are operating the Claude desktop app (bundle com.anthropic.claudefordesktop) on behalf of claude-driver, an automation tool Taylor owns. ' +
  'Touch only the Claude app. Never click any approval card, permission prompt, delete confirmation or "Allow" button; if one appears, stop and report it. ' +
  'Do not type anything except the exact text given. Report precisely what you saw and did.'

export async function computerUse(task, {timeoutSec=180, session='claude-driver', progress=()=>{}, signal, outputSchema}={}) {
  assertUiAvailable()
  return withLock('ui-automation',async()=>{
    assertUiAvailable()
    if(signal?.aborted)throw new DriverError('UI lease cancelled before startup',{category:'cancelled'})
    const dir=ensureDir(join(STATE_DIR,'tierc',randomUUID()))
    const payload=JSON.stringify({task:`${POSTURE}\n\nTask: ${task}`,timeoutSec,outputSchema})
    if(Buffer.byteLength(payload)>64*1024)throw new DriverError('UI task exceeds worker bound',{category:'bad_args'})
    const child=spawn(process.execPath,[WORKER],{env:{...process.env,CODEX_BRIDGE_TRANSPORT:'stdio',CODEX_BRIDGE_STATE_DIR:dir},stdio:['pipe','pipe','pipe'],detached:true})
    let output='',stderr='',stopped=false,timedOut=false,overflow=false,spawnError
    const stop=()=>{stopped=true;try{process.kill(-child.pid,'SIGTERM')}catch{}}
    const timer=setTimeout(()=>{timedOut=true;stop()},(Math.max(30,timeoutSec)+10)*1000)
    const hard=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL')}catch{}},(Math.max(30,timeoutSec)+15)*1000)
    const abort=()=>stop()
    signal?.addEventListener('abort',abort,{once:true})
    if(signal?.aborted)abort()
    child.stdout.on('data',x=>{output+=x;if(Buffer.byteLength(output)>1024*1024){overflow=true;stop()}})
    child.stderr.on('data',x=>{stderr=(stderr+x).slice(-64*1024);for(const line of x.toString().split('\n')){try{const r=JSON.parse(line);if(typeof r.progress==='string')progress(r.progress)}catch{}}})
    child.stdin.on('error',()=>{})
    child.stdin.end(payload)
    const code=await new Promise(resolve=>{child.once('exit',resolve);child.once('error',e=>{spawnError=e.message;resolve(-1)})})
    clearTimeout(timer);clearTimeout(hard);signal?.removeEventListener('abort',abort)
    // A terminated worker may leave backend/MCP descendants. Its detached
    // process group contains only this lease, never the shared daemon/app.
    if(child.pid){try{process.kill(-child.pid,'SIGTERM')}catch{}}
    let result
    try{result=JSON.parse(output)}catch{}
    const evidence=join(dir,'result.json')
    writeJsonAtomic(evidence,{session,code,timedOut,stopped,overflow,spawnError,result,stderr})
    if(signal?.aborted)throw new DriverError('UI lease cancelled; inspect state before another send',{category:'cancelled',detail:{evidence}})
    if(code!==0||result?.error||!result?.result||overflow||timedOut)throw new DriverError(`Tier C private worker failed: ${result?.error?.message||spawnError||(timedOut?'timeout':'invalid result')}`,{category:'tier_c_failed',detail:{evidence}})
    if(result.execution?.transport!=='stdio'||result.execution?.privateStateDir!==dir)throw new DriverError('Tier C worker isolation could not be verified',{category:'tier_c_failed',detail:{evidence}})
    let structured
    if(outputSchema&&result.result.status==='completed'){
      try{structured=JSON.parse(result.result.finalText)}catch{throw new DriverError('Tier C worker returned an invalid structured outcome',{category:'tier_c_failed',detail:{evidence}})}
    }
    return {status:result.result.status,text:result.text,evidence,metrics:result.result.metrics,execution:result.execution,structured}
  },{signal})
}

// Type a line into the composer of the session currently shown in the main
// window and send it. The caller navigates there first (deep link).
export async function typeIntoComposer(expectedTitle, line, opts) {
  return computerUse(
    `The Claude app's main window should be showing the Code session titled "${expectedTitle}". Confirm the session title shown matches exactly; if it does not, stop and report what is shown. ` +
      `Click its message composer (the text box at the bottom). If it already contains text, stop without changing it. ` +
      `Use the native composer's paste method with format text to enter exactly: ${line}\n` +
      `Do not use setValue (this app has ignored it) or per-character key input. ` +
      `Read back the composer's actual value and confirm it equals that line byte-for-byte before sending; duplicated characters have been observed. ` +
      `If it differs, stop without pressing Return and report the mismatch. If exact, press Return once. Then reobserve whether it was sent. ` +
      `Return the structured outcome: sent is true only if Return was pressed and the exact line appeared as a new user message with the composer cleared; otherwise false. Include a short reason.`,
    {...opts,outputSchema:{type:'object',properties:{sent:{type:'boolean'},reason:{type:'string'}},required:['sent','reason'],additionalProperties:false}}
  )
}
