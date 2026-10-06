// Inspect native input-resource ownership without starting Computer Use.
// Surviving filters are a hazard, not proof that an individual key doubled.
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {fileURLToPath} from 'node:url'
import {DriverError} from './paths.mjs'
import {recordMemory} from './memory.mjs'
import {readJson,writeJsonAtomic} from './state.mjs'
import {UI_QUARANTINE} from './ui-policy.mjs'
const run=promisify(execFile)
const script=fileURLToPath(new URL('../scripts/input-taps.swift',import.meta.url))

export function survivingClaudeFilters(taps,processes) {
 if(!Array.isArray(taps))throw new Error('invalid input audit')
 const pids=new Map(processes.trim().split('\n').filter(Boolean).map(line=>{
  const m=line.trim().match(/^(\d+)\s+(.+)$/)
  if(!m)throw new Error('invalid process audit')
  return [Number(m[1]),m[2]]
 }))
 return taps.filter(t=>{
  if(!Number.isInteger(t.ownerPid)||!Number.isInteger(t.targetPid)||!Number.isInteger(t.tapId)||typeof t.enabled!=='boolean'||!Number.isInteger(t.options)||!/^\d+$/.test(t.mask))throw new Error('invalid tap metadata')
  return t.enabled&&t.options===0&&(BigInt(t.mask)&7168n)!==0n
   &&/\/Codex Computer Use\.app\/Contents\/MacOS\/SkyComputerUseService$/.test(pids.get(t.ownerPid)||'')
   &&/\/Claude\.app\/Contents\/MacOS\/Claude$/.test(pids.get(t.targetPid)||'')
 })
}

export async function auditInputFilters() {
 if(process.platform!=='darwin')throw new Error('native input audit requires macOS')
 const results=await Promise.allSettled([
  run('/usr/bin/swift',[script],{timeout:10000,maxBuffer:512*1024}),
  run('/bin/ps',['-axo','pid=,comm='],{timeout:5000,maxBuffer:512*1024})
 ])
 if(results.some(r=>r.status!=='fulfilled'))throw new Error('native input audit unavailable')
 const taps=JSON.parse(results[0].value.stdout)
 return {at:new Date().toISOString(),filters:survivingClaudeFilters(taps,results[1].value.stdout)}
}

export async function assertInputHealthy({phase,evidence,audit=auditInputFilters}) {
 let snapshot,error
 try{snapshot=await audit();if(snapshot.filters.length)error='Computer Use keyboard filters remain attached to Claude'}
 catch{error='Native input-resource cleanup could not be verified'}
 if(evidence)writeJsonAtomic(evidence,{phase,...snapshot,...(error?{error}:{})})
 if(!error)return snapshot
 const previous=readJson(UI_QUARANTINE,null)
 writeJsonAtomic(UI_QUARANTINE,{...previous,blocked:true,reason:previous?.blocked?previous.reason:error,
  at:previous?.blocked?previous.at:new Date().toISOString(),source:previous?.blocked?previous.source:'input-health',inputHealth:{phase,evidence,filters:snapshot?.filters.length}})
 recordMemory({kind:'observation',topic:'native-input-health',source:'service',status:'observed',category:'ui_quarantined',evidence,lesson:`UI quarantined during ${phase}: ${error}`})
 throw new DriverError(error,{category:'ui_quarantined',detail:{evidence,phase}})
}
