// Opt-in service-scoped command hook. Installed separately from the broker pin;
// each client arms only its own durable request and exact prepared peer UUID.
import {createHash} from 'node:crypto'
import {existsSync,readFileSync,writeFileSync,unlinkSync,lstatSync} from 'node:fs'
import {join} from 'node:path'
import {BROKER_DIR,ensureDir,writeJsonAtomic} from './state.mjs'
import {loadEntryEvidence,stageRelease,validateRelease,HANDOFF_OWNER} from './releases.mjs'
import {DriverError} from './paths.mjs'
const policyFile=join(BROKER_DIR,'stop-rescue-policy.json'),armFile=join(BROKER_DIR,'stop-rescue-arm.json'),settings=join(BROKER_DIR,'.claude','settings.json')
const hash=b=>createHash('sha256').update(b).digest('hex')
const refused=()=>{throw new DriverError('Stop rescue policy changed or failed admission; no wake sent',{category:'broker_stop_rescue_refused',detail:{dispatched:false,retrySafe:true}})}
export function stopRescuePolicy({allowTemporaryProbe=false}={}){
 if(existsSync(join(BROKER_DIR,'mechanical-probe.json'))&&!allowTemporaryProbe)refused()
 if(!existsSync(policyFile))return null
 try{const p=loadEntryEvidence(policyFile),release=validateRelease(p?.build),script=join(release.root,'scripts','broker-stop-rescue.mjs');if(![1,2].includes(p?.feedbackVersion??1)||p.feedbackVersion===2&&p.quietWait||p.quietWait&&(!Number.isInteger(p.quietWait.maxMs)||p.quietWait.version!==1||p.quietWait.maxMs<1000||p.quietWait.maxMs>60000)||p.schemaVersion!==1||p.script!==script||hash(readFileSync(script))!==p.sha256||hash(readFileSync(settings))!==p.settingsHash)refused();return p}catch{refused()}
}
export async function installStopRescue({sessionId,pid,procStart,upgrade=false,quietWaitMs,feedbackVersion}={}){
 if(typeof sessionId!=='string'||!/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(sessionId)||!Number.isInteger(pid)||pid<=0||typeof procStart!=='string'||!procStart)refused()
 const prior=stopRescuePolicy();if(prior){if(prior.sessionId!==sessionId||prior.pid!==pid||prior.procStart!==procStart)refused();if(!upgrade)return {...prior,reused:true}}
 const quietMs=quietWaitMs??prior?.quietWait?.maxMs??0
 if(!Number.isInteger(quietMs)||quietMs!==0&&(quietMs<1000||quietMs>60000))refused()
 const feedback=feedbackVersion??prior?.feedbackVersion??1
 if(![1,2].includes(feedback)||feedback===2&&quietMs)refused()
 if(!prior&&existsSync(settings)||existsSync(armFile)||existsSync(join(BROKER_DIR,'quiet-hook-owner.json')))refused()
 const release=await stageRelease(),script=join(release.root,'scripts','broker-stop-rescue.mjs')
 const commandHook=event=>({type:'command',command:process.execPath,args:[script,BROKER_DIR,event],timeout:event==='Stop'&&quietMs?quietMs/1000+5:5})
 const body=JSON.stringify({hooks:{Stop:[{hooks:[commandHook('Stop')]}],PreToolUse:[{matcher:'Bash|mcp__ccd_.*',hooks:[commandHook('PreToolUse')]}]}},null,2)
 const policy={schemaVersion:1,nativeEffectAdmissionVersion:1,feedbackVersion:feedback,...(quietMs?{quietWait:{version:1,maxMs:quietMs}}:{}),sessionId,pid,procStart,build:release.build,script,sha256:hash(readFileSync(script)),settingsHash:hash(body),maximumRescuesPerRequest:1,installedAt:Date.now()}
 ensureDir(join(BROKER_DIR,'.claude'))
 if(prior){if(hash(readFileSync(settings))!==prior.settingsHash)refused();writeJsonAtomic(settings,JSON.parse(body))}else writeFileSync(settings,body,{mode:0o600,flag:'wx'})
 writeJsonAtomic(policyFile,policy)
 return policy
}
export function armStopHandoff(policy,{nonce,expiresAt},wake){
 const current=stopRescuePolicy(),stop=loadEntryEvidence(join(BROKER_DIR,'STOP'))
 if(!current||current.sha256!==policy.sha256||wake.pid!==current.pid||wake.procStart!==current.procStart||typeof nonce!=='string'||!(/^[A-Za-z0-9_-]{1,64}$/).test(nonce)||stop?.owner!==HANDOFF_OWNER||stop.nonce!==nonce||stop.pid!==current.pid||stop.procStart!==current.procStart||stop.sessionId!==current.sessionId||!Number.isFinite(expiresAt)||expiresAt<=Date.now()||expiresAt>Date.now()+90000)refused()
 writeJsonAtomic(armFile,{schemaVersion:1,mode:'settle-handoff',nonce,sessionId:current.sessionId,brokerDir:BROKER_DIR,pid:wake.pid,procStart:wake.procStart,msgId:wake.msgId,requestId:'rhandoff-'+nonce,expiresAt})
}
export function armStopRescue(policy,request,wake){
 const current=stopRescuePolicy();if(!current||current.sha256!==policy.sha256||wake.pid!==current.pid||wake.procStart!==current.procStart||request.nativeObservation?.brokerSessionId!==current.sessionId)refused()
 writeJsonAtomic(armFile,{schemaVersion:1,feedbackVersion:current.feedbackVersion??1,sessionId:current.sessionId,brokerDir:BROKER_DIR,pid:wake.pid,procStart:wake.procStart,msgId:wake.msgId,requestId:request.id,expiresAt:Math.min(request.expiresAt,Date.now()+90000)})
}
export function disarmStopRescue(requestId){try{const arm=loadEntryEvidence(armFile);if(arm?.requestId===requestId){const st=lstatSync(armFile);if(st.isFile()&&!st.isSymbolicLink())unlinkSync(armFile)}}catch{}}
