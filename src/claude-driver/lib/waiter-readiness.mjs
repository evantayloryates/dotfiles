// Busy/working describes the previous turn, not readiness to receive new work.
// Only a captured foreground waiter from the current sealed native epoch is a
// pickup channel. Legacy entry timestamps have one-second process precision;
// they are scoped liveness evidence, not a hostile-user identity boundary.
import {execFileSync} from 'node:child_process'
import {join} from 'node:path'
import {DriverError} from './paths.mjs'
const ps=pid=>execFileSync('/bin/ps',['-p',String(pid),'-o','ppid=','-o','lstart='],{encoding:'utf8',timeout:500,env:{PATH:'/usr/bin:/bin',LC_ALL:'C',TZ:'UTC'}}).trim().match(/^(\d+)\s+(.+)$/)
export function verifyWaiterReadiness({sessionId,live,runtime,pointer,selected,completed,heartbeat,brokerDir,now=Date.now()}){
 const no=reason=>({verified:false,reason})
 try{
  const h=heartbeat,s=selected,b=s?.nativeBinding
  if(!live||live.entrypoint!=='claude-desktop'||runtime?.integrity!==true||pointer?.sessionId!==sessionId||pointer.pid!==live.pid||pointer.procStart!==live.procStart)return no('waiter-native-epoch-unavailable')
  if(!Number.isInteger(live.pid)||live.pid<=1||typeof live.procStart!=='string'||!live.procStart.trim()||!Number.isInteger(pointer.generation)||pointer.generation<1||!(/^[a-f0-9]{64}$/).test(pointer.build)||!(/^[a-f0-9]{64}$/).test(pointer.bootstrapHash)||!Number.isFinite(Date.parse(pointer.activatedAt))||Date.parse(pointer.activatedAt)>now)return no('waiter-pointer-invalid')
  if(!h||h.state!=='waiting'||!Number.isFinite(h.at)||h.at>now||now-h.at>=6000||!Number.isInteger(h.pid)||h.pid<=1||h.pid===live.pid)return no('no-current-waiting-heartbeat')
  if(s?.phase!=='selected'||s.pid!==h.pid||s.build!==pointer.build||s.bootstrapHash!==pointer.bootstrapHash||s.generation!==pointer.generation||s.script!==join(brokerDir,'..','releases',pointer.build,'scripts','broker-wait.mjs')||!Number.isFinite(s.at)||s.at>h.at||s.at<Date.parse(pointer.activatedAt)||b?.ancestorVerified!==true||b.brokerPid!==live.pid||b.brokerProcStart!==live.procStart||b.brokerSessionId!==sessionId)return no('waiter-selected-entry-mismatch')
  if(completed?.pid===h.pid&&completed.phase==='completed'&&completed.at>=s.at)return no('waiter-already-completed')
  const first=ps(h.pid),started=Date.parse(first?.[2]+' UTC')
  if(!first||Number(first[1])!==h.ppid||!Number.isFinite(started)||started>s.at||s.at-started>10000)return no('waiter-helper-unavailable-or-reused')
  let pid=h.pid
  for(let hop=0;hop<24&&pid>1;hop++){
   const row=hop===0?first:ps(pid);if(!row)return no('waiter-ancestry-unavailable')
   if(pid===live.pid)return row[2]===live.procStart?{verified:true,helperPid:h.pid,helperStart:first[2],heartbeatAt:h.at,reason:'live-owned-foreground-waiter'}:no('waiter-native-start-mismatch')
   pid=Number(row[1])
  }
  return no('waiter-foreign-ancestry')
 }catch{return no('waiter-proof-unavailable')}
}

// Backpressure before enqueue: allow the finishing native turn to reach idle,
// or discover a real pickup channel. This never sends, cancels or restarts.
export async function waitForNativeAvailability(info,{observe,deadline,signal,sleep,progress=()=>{}}){
 let idleSince=null,announced=false
 for(;;){
  if(signal?.aborted)throw new DriverError('cancelled before enqueue',{category:'cancelled',detail:{dispatched:false,retrySafe:true}})
  if(Date.now()>=deadline)throw new DriverError('native broker did not reach an available turn boundary before enqueue',{category:'broker_busy',detail:{dispatched:false,retrySafe:true}})
  if(!info.live||info.live.entrypoint!=='claude-desktop')return info
  if(info.handoffStopped||info.runtime?.integrity===false||info.runtime?.dependencyEvidence?.reason==='native-process-epoch-mismatch')return info // caller applies existing refusal
  if(info.resident?.resident)return info
  if(info.live.status==='idle'){
   idleSince??=Date.now()
   if(Date.now()-idleSince>=250)return info
  }else idleSince=null
  if(!announced){progress('waiting for a verified native pickup channel or idle turn boundary before enqueue');announced=true}
  await sleep(Math.min(250,Math.max(1,deadline-Date.now())))
  const next=observe()
  if(next.sessionId!==info.sessionId||next.live?.pid!==info.live.pid||next.live?.procStart!==info.live.procStart)throw new DriverError('native broker changed while awaiting admission',{category:'broker_runtime_epoch_mismatch',detail:{dispatched:false,retrySafe:true}})
  info=next
 }
}
