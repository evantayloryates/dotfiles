#!/usr/bin/env node
// One isolated UI lease. This process never connects to the shared daemon or
// resumes a different caller's thread. Its state belongs to claude-driver.
import {readFileSync} from 'node:fs'
import {assertUiAvailable} from '../lib/ui-policy.mjs'
let bridge
try{
 assertUiAvailable()
 const raw=readFileSync(0,'utf8')
 if(Buffer.byteLength(raw)>64*1024)throw new Error('UI task exceeds worker bound')
 const input=JSON.parse(raw)
 if(typeof input.task!=='string'||!Number.isFinite(input.timeoutSec))throw new Error('invalid UI worker input')
 const {Bridge}=await import('../../codex-bridge/lib/bridge.mjs')
 bridge=new Bridge({log:(...a)=>console.error('[tier-c]',...a)})
 bridge.app.mode='stdio'
 const result=await bridge.run({task:input.task,session:'claude-driver-ui',new_thread:true,mcp_roster:'trim',apps:['Claude','com.anthropic.claudefordesktop'],timeout_sec:input.timeoutSec,screenshots:'none'}, {progress:message=>console.error(JSON.stringify({progress:message}))})
 console.log(JSON.stringify(result))
}catch(e){console.log(JSON.stringify({error:{category:e.category||'tier_c_failed',message:e.message}}));process.exitCode=1}
finally{bridge?.close()}
