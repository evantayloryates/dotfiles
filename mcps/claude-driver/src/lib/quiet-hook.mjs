// Readiness comes from a live owned command-hook helper, not model prose or a
// cached heartbeat. This opt-in experiment keeps one native query open briefly.
import {execFileSync} from 'node:child_process'
import {join} from 'node:path'
import {BROKER_DIR} from './state.mjs'
import {loadEntryEvidence} from './releases.mjs'
import {stopRescuePolicy} from './stop-rescue.mjs'
const ps=pid=>execFileSync('/bin/ps',['-p',String(pid),'-o','ppid=','-o','lstart='],{encoding:'utf8',timeout:500,env:{PATH:'/usr/bin:/bin',LC_ALL:'C',TZ:'UTC'}}).trim().match(/^(\d+)\s+(.+)$/)
export function quietHookStatus({sessionId,live,now=Date.now()}={}){
 try{return verifyQuietHookEvidence({sessionId,live,now,p:stopRescuePolicy(),pointer:loadEntryEvidence(join(BROKER_DIR,'runtime.json')),m:loadEntryEvidence(join(BROKER_DIR,'quiet-hook.json')),owner:loadEntryEvidence(join(BROKER_DIR,'quiet-hook-owner.json'))})}catch{return {verified:false,reason:'quiet-hook-proof-unavailable'}}
}
export function verifyQuietHookEvidence({sessionId,live,now=Date.now(),p,pointer,m,owner}){
 const no=reason=>({verified:false,reason})
 try{
  if(p?.quietWait?.version!==1||!Number.isInteger(p.quietWait.maxMs)||p.quietWait.maxMs<1000||p.quietWait.maxMs>60000||!m)return no('quiet-hook-not-enrolled')
  if(owner?.token!==m.token||owner?.helperPid!==m.helperPid||owner?.helperStart!==m.helperStart||pointer?.sessionId!==sessionId||pointer.pid!==live?.pid||pointer.procStart!==live?.procStart||pointer.build!==m.build||pointer.generation!==m.generation||!live||m.helperPid===live.pid||live.entrypoint!=='claude-desktop'||m.sessionId!==sessionId||m.nativePid!==live.pid||m.nativeStart!==live.procStart||p.sessionId!==sessionId||p.pid!==live.pid||p.procStart!==live.procStart||m.handlerSha256!==p.sha256||m.settingsHash!==p.settingsHash||m.state!=='waiting'||!Number.isInteger(m.helperPid)||m.helperPid<=1||typeof m.helperStart!=='string'||!Number.isFinite(m.at)||m.at>now||now-m.at>3000||!Number.isFinite(m.deadline)||m.deadline<=now||m.deadline>now+p.quietWait.maxMs)return no('quiet-hook-evidence-mismatch')
  let pid=m.helperPid;const first=ps(pid);if(first?.[2]!==m.helperStart)return no('quiet-hook-helper-unavailable')
  for(let hop=0;hop<24&&pid>1;hop++){const r=hop===0?first:ps(pid);if(!r)return no('quiet-hook-ancestry-unavailable');if(pid===live.pid)return r[2]===live.procStart?{verified:true,helperPid:m.helperPid,deadline:m.deadline,handlerSha256:p.sha256,reason:'live-owned-quiet-command-hook'}:no('quiet-hook-native-epoch-mismatch');pid=Number(r[1])}
  return no('quiet-hook-foreign-ancestry')
 }catch{return no('quiet-hook-proof-unavailable')}
}
