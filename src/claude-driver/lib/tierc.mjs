// Tier C: computer use through the existing codex-bridge engine in an
// isolated private worker, without modifying or restarting the shared daemon. Used for what neither disk, deep links nor ccd_* tools reach:
// broker revival when the app will not warm-spawn, window management, and
// UI-only affordances. Results are claims; callers verify through Tier A.

import {randomUUID} from 'node:crypto'
import {join} from 'node:path'
import {DriverError} from './paths.mjs'
import {assertUiAvailable} from './ui-policy.mjs'
import {assertInputHealthy} from './input-health.mjs'
import {runOwnedUiLease} from './ui-lease-owner.mjs'
import {STATE_DIR,ensureDir,withLock} from './state.mjs'

const POSTURE =
  'You are operating the Claude desktop app (bundle com.anthropic.claudefordesktop) on behalf of claude-driver, an automation tool Taylor owns. ' +
  'Touch only the Claude app. Never click any approval card, permission prompt, delete confirmation or "Allow" button; if one appears, stop and report it. ' +
  'Do not type anything except the exact text given. Report precisely what you saw and did.'

export async function computerUse(task, {timeoutSec=180, session='claude-driver', progress=()=>{}, signal, outputSchema}={}) {
  assertUiAvailable()
  return withLock('ui-automation',async(lockFd)=>{
    assertUiAvailable()
    if(signal?.aborted)throw new DriverError('UI lease cancelled before startup',{category:'cancelled'})
    const dir=ensureDir(join(STATE_DIR,'tierc',randomUUID()))
    const payload=JSON.stringify({task:`${POSTURE}\n\nTask: ${task}`,timeoutSec,outputSchema})
    if(Buffer.byteLength(payload)>64*1024)throw new DriverError('UI task exceeds worker bound',{category:'bad_args'})
    await assertInputHealthy({phase:'before-lease',evidence:join(dir,'input-taps-before.json')})
    assertUiAvailable()
    if(signal?.aborted)throw new DriverError('UI lease cancelled before startup',{category:'cancelled'})
    try{
      const owned=await runOwnedUiLease({payload:JSON.parse(payload),dir,lockFd,signal,progress})
      const result=owned.worker,evidence=owned.evidence,nativeInputService=owned.nativeInputService
      if(result.execution?.transport!=='stdio'||result.execution?.privateStateDir!==dir||result.execution?.inputServiceSocket!==owned.owner.socket||result.execution?.mcpAdmission?.serverName!=='cua_repl'||JSON.stringify(result.execution?.ownerLock)!==JSON.stringify(owned.owner.lock))throw new DriverError('Tier C worker isolation could not be verified',{category:'tier_c_failed',detail:{evidence}})
      let structured
      if(outputSchema&&result.result.status==='completed'){
        try{structured=JSON.parse(result.result.finalText)}catch{throw new DriverError('Tier C worker returned an invalid structured outcome',{category:'tier_c_failed',detail:{evidence}})}
      }
      return {status:result.result.status,text:result.text,evidence,metrics:result.result.metrics,execution:{...result.execution,nativeInputService,owner:owned.owner},structured}
    }finally{
      // The caller audits unexpected owner failure too. The owner performs its
      // own audit when this caller has disappeared.
      await assertInputHealthy({phase:'after-lease',evidence:join(dir,'input-taps-after.json')})
    }
  },{signal,passKernelLock:true})
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
