import {randomBytes} from 'node:crypto'
import {mkdirSync,writeFileSync,renameSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {withLock} from './state.mjs'
import {brokerInfo} from './broker.mjs'
import {versions,resolveClaudeBinary,sleep} from './paths.mjs'
import {MOD_PROBE,readProbeBytes,probePathPresence} from './native-mod-probe-evidence.mjs'
import {buildNativePeerServicePackage} from './native-peer-service-package.mjs'
import {screenNativeServiceReady} from './native-peer-service-evidence.mjs'
const root='/Users/taylor/.local/state/claude-driver/pressure/'
// Explicit bounded enrollment in the previously consented exact owned session.
// No wake, new chat, permission change, read dispatch or replacement of a module.
export async function enrollNativeService({lifetimeSec=300,maxRequests=8,signal}={}){
 if(!Number.isInteger(lifetimeSec)||lifetimeSec<60||lifetimeSec>3600||!Number.isInteger(maxRequests)||maxRequests<1||maxRequests>128)throw Error('invalid native service enrollment bounds')
 return withLock('broker',async()=>{
  let phase='guard',serviceId=null,installed=false
  try{
   const guard=()=>{
    if(signal?.aborted)throw Error('cancelled')
    const b=brokerInfo(),v=versions()
    if(b.sessionId!==MOD_PROBE.brokerSession||b.live?.pid!==MOD_PROBE.pid||b.live.procStart!==MOD_PROBE.procStart||b.live.status!=='idle'||b.live.entrypoint!=='claude-desktop'||b.permissionMode!=='bypassPermissions'||b.runtime?.build!==MOD_PROBE.brokerBuild||!b.runtime.pinned||!b.runtime.integrity||v.app!=='2.26454.0'||v.cli!=='2.1.289')throw Error('epoch refused')
    if(readProbeBytes(MOD_PROBE.brokerCwd+'/.claude/settings.json').sha256!==MOD_PROBE.settingsHash||readProbeBytes(MOD_PROBE.brokerCwd+'/stop-rescue-policy.json').sha256!==MOD_PROBE.policyHash)throw Error('baseline refused')
    if(['STOP','stop-rescue-arm.json','mechanical-probe.json'].some(p=>probePathPresence(MOD_PROBE.brokerCwd+'/'+p)!==false))throw Error('control refused')
    return b
   }
   const b=guard(),now=Date.now();serviceId=randomBytes(16).toString('hex')
   const config={id:serviceId,token:'claude-driver service-read '+randomBytes(16).toString('hex'),brokerSession:b.sessionId,brokerCwd:MOD_PROBE.brokerCwd,build:b.runtime.build,notBefore:now,deadline:now+lifetimeSec*1000,maxRequests},pkg=buildNativePeerServicePackage(config),stage=root+'native-service-stage-'+serviceId,dest='/Users/taylor/.claude/dev-mods/'+config.brokerSession.slice(6)+'/desktop-bridge-native-peer-service'
   if(probePathPresence(dest)!==false)throw Error('existing module requires reconciliation')
   phase='stage';for(const[p,bytes]of Object.entries(pkg.files)){mkdirSync(stage+'/'+p.slice(0,p.lastIndexOf('/')),{recursive:true});writeFileSync(stage+'/'+p,bytes,{flag:'wx',mode:0o600})}
   phase='validate';execFileSync(resolveClaudeBinary(),['plugin','validate',stage],{stdio:'pipe',timeout:20000});guard()
   if(probePathPresence(dest)!==false)throw Error('module destination changed')
   const enrollment={kind:'service',config,epoch:{pid:b.live.pid,procStart:b.live.procStart,build:b.runtime.build},baseline:{'.claude/settings.json':MOD_PROBE.settingsHash,'stop-rescue-policy.json':MOD_PROBE.policyHash},expectedVersions:versions(),dest,hashes:pkg.hashes}
   phase='publish';writeFileSync(root+'native-service-enrollment-'+serviceId+'.json',JSON.stringify(enrollment)+'\n',{flag:'wx',mode:0o600});renameSync(stage,dest);installed=true
   phase='readiness';const readyFile=config.brokerCwd+'/.native-service-'+serviceId+'.ready.json',until=Math.min(config.deadline,Date.now()+30000)
   while(Date.now()<until){
    if(signal?.aborted)throw Error('cancelled')
    if(probePathPresence(readyFile)===true){const ready=JSON.parse(readProbeBytes(readyFile,4096).bytes.toString('utf8'));guard();if(!screenNativeServiceReady({config,ready,now:Date.now()}))throw Error('readiness refused');return {serviceId,installed:true,readinessObserved:true,deadline:config.deadline,maxRequests,servingQualified:false,releaseAuthorized:false}}
    await sleep(200)
   }
   return {serviceId,installed:true,readinessObserved:false,deadline:config.deadline,maxRequests,servingQualified:false,releaseAuthorized:false}
  }catch{throw Object.assign(Error('native service enrollment refused at '+phase+(serviceId?'; inspect '+serviceId:'')),{category:'native_service_enrollment_refused',detail:{serviceId,phase,installed,retrySafe:!installed}})}
 },{timeoutMs:5000,signal})
}
