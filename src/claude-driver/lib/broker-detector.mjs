// Thirty-second, metadata-only sensing. No inference, peer send, recovery,
// transcript/key read, permission change or native process termination.
import {constants,openSync,closeSync,fstatSync,readFileSync,readdirSync,existsSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {createHash,randomUUID} from 'node:crypto'
import {join,resolve} from 'node:path'
import {writeJsonAtomic} from './state.mjs'

function json(path){
 let fd
 try{fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);const s=fstatSync(fd);if(!s.isFile()||s.uid!==process.getuid()||s.size>256*1024)return null;return JSON.parse(readFileSync(fd,'utf8'))}
 catch{return null}finally{if(fd!==undefined)closeSync(fd)}
}
function alive(pid){try{process.kill(pid,0);return true}catch(e){return e.code==='EPERM'?null:false}}
function start(pid){try{return execFileSync('/bin/ps',['-p',String(pid),'-o','lstart='],{encoding:'utf8',timeout:1000,env:{PATH:'/usr/bin:/bin',LC_ALL:'C',TZ:'UTC'}}).trim()}catch{return null}}
export function sampleBroker({brokerDir,recordFile,peerDir,now=Date.now(),isAlive=alive,procStart=start}) {
 const config=json(join(brokerDir,'broker.json')),record=recordFile&&json(recordFile)
 const base={sessionId:config?.sessionId??null,at:now}
 if(existsSync(join(brokerDir,'STOP')))return {...base,state:'intentional-stop'}
 if(!config?.sessionId||!record)return {...base,state:'observation-unavailable',reason:'owned-record-unavailable'}
 if(record.sessionId!==config.sessionId||resolve(record.cwd||'/')!==resolve(brokerDir)||record.title!=='claude-driver-broker'||record.isArchived||record.permissionMode!=='bypassPermissions')
  return {...base,state:'identity-changed',reason:'approved-broker-fields-changed'}
 let files;try{files=readdirSync(peerDir)}catch{return {...base,state:'observation-unavailable',reason:'peer-metadata-unavailable'}}
 const live=[]
 for(const name of files){
  if(!/^\d+\.json$/.test(name))continue
  const r=json(join(peerDir,name));if(r?.hostSessionId!==config.sessionId||r.pid!==Number(name.slice(0,-5))||r.spare||r.parkedJobId)continue
  const running=isAlive(r.pid)
  if(running===null)return {...base,state:'observation-unavailable',reason:'process-liveness-denied'}
  if(!running)continue
  if(!r.procStart||!['claude-desktop'].includes(r.entrypoint)||r.sessionId!==(record.cliSessionId||config.sessionId.slice(6)))return {...base,state:'observation-unavailable',reason:'native-process-identity-unavailable'}
  const epoch=procStart(r.pid)
  if(epoch===null)return {...base,state:'observation-unavailable',reason:'native-process-epoch-unavailable'}
  if(epoch!==r.procStart)continue
  live.push(r)
 }
 if(live.length>1)return {...base,state:'observation-unavailable',reason:'multiple-live-native-processes'}
 if(!live.length)return {...base,state:'offline',reason:'no-live-owned-native-process'}
 const r=live[0],result={...base,pid:r.pid,procStart:r.procStart,cli:r.version,status:r.status,state:'live'}
 // Idle is normal. Emit a serving alert only for current unclaimed work,
 // after a grace period, never from a stale heartbeat or model statement.
 if(r.status==='idle'){
  let requests;try{requests=readdirSync(join(brokerDir,'requests'))}catch{return result}
  const pending=[]
  for(const name of requests){
   if(!/^[A-Za-z0-9_-]+\.json$/.test(name))continue
   const id=name.slice(0,-5),control=json(join(brokerDir,'controls',name))
   if(control?.state!=='pending'||control.cancelRequested||control.dispatched?.length)continue
   const request=json(join(brokerDir,'requests',name))
   if(request?.id!==id||!Number.isFinite(request.expiresAt)||request.expiresAt<=now||!Number.isFinite(Date.parse(request.createdAt))||now-Date.parse(request.createdAt)<15000)continue
   pending.push(id)
  }
  if(pending.length)return {...result,state:'unserved-work',reason:'idle-with-current-unclaimed-work',requestIds:pending.sort().slice(0,16)}
 }
 return result
}
export function eventKey(sample){return JSON.stringify({state:sample.state,reason:sample.reason??null,pid:sample.pid??null,procStart:sample.procStart??null,requestIds:sample.requestIds??[]})}
export function detectorTransition(previous,sample) {
 const fault=!['live','intentional-stop'].includes(sample.state)
 const priorFault=previous&&!['live','intentional-stop'].includes(previous.state)
 if(sample.state==='intentional-stop')return null
 if(fault&&eventKey(previous||{})!==eventKey(sample))return {kind:'fault-observation',key:eventKey(sample)}
 if(sample.state==='live'&&priorFault)return {kind:'liveness-returned',key:eventKey(sample)}
 if(sample.state==='live'&&previous?.state==='live'&&(previous.pid!==sample.pid||previous.procStart!==sample.procStart))return {kind:'native-process-changed',key:eventKey(sample)}
 return null
}
export function easternStamp(now) {
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZoneName:'longOffset'}).formatToParts(new Date(now)).map(p=>[p.type,p.value]))
 return `${parts.year}${parts.month}${parts.day}T${parts.hour}${parts.minute}${parts.second}${parts.timeZoneName.replace('GMT','').replace(':','')}`
}
export function publishDetectorEvent({sample,event,reportDir,runtimeBuild}) {
 const digest=createHash('sha256').update(event.key).digest('hex').slice(0,12)
 const name=`claude-detector-${easternStamp(sample.at)}-${digest}-${randomUUID().slice(0,8)}.report.json`,file=join(reportDir,name)
 writeJsonAtomic(file,{schemaVersion:1,generatedAt:new Date(sample.at).toISOString(),episodeId:digest,source:'claude-driver-local-detector',brokerSessionId:sample.sessionId,runtimeBuild,
  reason:event.kind,observedFacts:{...sample,verification:'Process availability and queued metadata only; neither crash cause nor bridge readiness is established'},
  recovery:{attempted:false,method:null,outcome:'observer-owned'},inferenceCalls:0,
  unknowns:['Cause and native receipt require independent review','The detector never wakes or restarts the broker or another chat']})
 return {file,name}
}
