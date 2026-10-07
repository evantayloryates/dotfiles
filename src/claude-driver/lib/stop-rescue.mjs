// Opt-in service-scoped command hook. Installed separately from the broker pin;
// each client arms only its own durable request and exact prepared peer UUID.
import {createHash} from 'node:crypto'
import {existsSync,readFileSync,writeFileSync,unlinkSync,lstatSync} from 'node:fs'
import {join} from 'node:path'
import {BROKER_DIR,ensureDir,writeJsonAtomic} from './state.mjs'
import {loadEntryEvidence,stageRelease,validateRelease} from './releases.mjs'
import {DriverError} from './paths.mjs'
const policyFile=join(BROKER_DIR,'stop-rescue-policy.json'),armFile=join(BROKER_DIR,'stop-rescue-arm.json'),settings=join(BROKER_DIR,'.claude','settings.json')
const hash=b=>createHash('sha256').update(b).digest('hex')
const refused=()=>{throw new DriverError('Stop rescue policy changed or failed admission; no wake sent',{category:'broker_stop_rescue_refused',detail:{dispatched:false,retrySafe:true}})}
export function stopRescuePolicy(){
 if(!existsSync(policyFile))return null
 try{const p=loadEntryEvidence(policyFile),release=validateRelease(p?.build),script=join(release.root,'scripts','broker-stop-rescue.mjs');if(p.schemaVersion!==1||p.script!==script||hash(readFileSync(script))!==p.sha256||hash(readFileSync(settings))!==p.settingsHash)refused();return p}catch{refused()}
}
export async function installStopRescue({sessionId,pid,procStart}={}){
 if(typeof sessionId!=='string'||!/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(sessionId)||!Number.isInteger(pid)||pid<=0||typeof procStart!=='string'||!procStart)refused()
 const prior=stopRescuePolicy();if(prior){if(prior.sessionId!==sessionId||prior.pid!==pid||prior.procStart!==procStart)refused();return {...prior,reused:true}}
 if(existsSync(settings)||existsSync(armFile))refused()
 const release=await stageRelease(),script=join(release.root,'scripts','broker-stop-rescue.mjs')
 const body=JSON.stringify({hooks:{Stop:[{hooks:[{type:'command',command:process.execPath,args:[script,BROKER_DIR],timeout:5}]}]}},null,2)
 const policy={schemaVersion:1,sessionId,pid,procStart,build:release.build,script,sha256:hash(readFileSync(script)),settingsHash:hash(body),maximumRescuesPerRequest:1,installedAt:Date.now()}
 ensureDir(join(BROKER_DIR,'.claude'));writeFileSync(settings,body,{mode:0o600,flag:'wx'});writeJsonAtomic(policyFile,policy)
 return policy
}
export function armStopRescue(policy,request,wake){
 const current=stopRescuePolicy();if(!current||current.sha256!==policy.sha256||wake.pid!==current.pid||wake.procStart!==current.procStart||request.nativeObservation?.brokerSessionId!==current.sessionId)refused()
 writeJsonAtomic(armFile,{schemaVersion:1,sessionId:current.sessionId,brokerDir:BROKER_DIR,pid:wake.pid,procStart:wake.procStart,msgId:wake.msgId,requestId:request.id,expiresAt:Math.min(request.expiresAt,Date.now()+90000)})
}
export function disarmStopRescue(requestId){try{const arm=loadEntryEvidence(armFile);if(arm?.requestId===requestId){const st=lstatSync(armFile);if(st.isFile()&&!st.isSymbolicLink())unlinkSync(armFile)}}catch{}}
