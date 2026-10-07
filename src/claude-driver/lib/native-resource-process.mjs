import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {buildNativeResourceProgram} from './native-resource-program.mjs'
// PID-scoped inspection only. No process enumeration, signals or raw argv output.
export function inspectNativeResourcePid(pid,{command=false}={}){
 if(!Number.isSafeInteger(pid)||pid<2)throw Error('invalid process identity')
 const r=spawnSync('/bin/ps',['-ww','-p',String(pid),'-o',command?'command=':'pid=,ppid=,lstart='],{encoding:'utf8',timeout:2000,maxBuffer:32768,env:{...process.env,TZ:'UTC'}})
 if(!r.error&&r.status===1&&r.stdout.trim()===''&&r.stderr.trim()==='')return null
 if(r.error||r.status!==0||r.stderr.trim())throw Error('process observation unavailable')
 if(command)return r.stdout.replace(/\n$/,'')
 const match=r.stdout.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/)
 if(!match||Number(match[1])!==pid||!Number.isSafeInteger(Number(match[2])))throw Error('process metadata refused')
 return {pid,ppid:Number(match[2]),procStart:match[3]}
}
export function observeNativeResourceProcess({config,ready,epoch},inspect=inspectNativeResourcePid){
 if(config.resourceProbe!==true||ready.serviceId!==config.id||!Number.isSafeInteger(epoch?.pid)||epoch.pid<2||typeof epoch.procStart!=='string')throw Error('resource process identity refused')
 const child=inspect(ready.pid)
 if(child===null)return {state:'absent',pid:ready.pid,observedAt:new Date().toISOString(),ownershipVerified:false}
 if(child.ppid!==ready.ppid)throw Error('resource parent changed')
 const command=inspect(ready.pid,{command:true}),expected=['/opt/homebrew/bin/node','--input-type=module','-e',buildNativeResourceProgram({serviceId:config.id,deadline:config.deadline+30000,evidenceRoot:config.brokerCwd})].join(' ')
 // macOS ps renders embedded argv newlines as octal \012, not raw LF.
 if(command!==expected&&command!==expected.replaceAll('\n','\\012'))throw Error('resource command refused')
 const ancestry=[],seen=new Set([child.pid]);let parent=child.ppid,verified=false
 for(let i=0;i<8&&parent>1;i++){
  if(seen.has(parent))throw Error('resource ancestry cycle');seen.add(parent)
  const row=inspect(parent);if(!row)throw Error('resource ancestry unavailable');ancestry.push(row)
  if(row.pid===epoch.pid){if(row.procStart!==epoch.procStart)throw Error('broker process epoch changed');verified=true;break}
  parent=row.ppid
 }
 if(!verified)throw Error('resource native ancestry refused')
 const after=inspect(ready.pid)
 if(JSON.stringify(after)!==JSON.stringify(child))throw Error('resource process changed during observation')
 const start=Date.parse(child.procStart+' UTC'),claimed=Date.parse(ready.startedAt)
 if(!Number.isFinite(start)||!Number.isFinite(claimed)||claimed<start||claimed-start>10000)throw Error('resource process start refused')
 return {state:'alive',observedAt:new Date().toISOString(),...child,commandSha256:createHash('sha256').update(command).digest('hex'),ancestry,ownershipVerified:true}
}
