import {lstatSync,readdirSync,writeFileSync} from 'node:fs'
import {readProbeBytes,probePathPresence,MOD_PROBE} from './native-mod-probe-evidence.mjs'
import {buildNativePeerServicePackage} from './native-peer-service-package.mjs'
import {screenNativeServiceReady} from './native-peer-service-evidence.mjs'
import {publishNativeServiceDirectory} from './native-service-enroll.mjs'
import {brokerInfo} from './broker.mjs'
import {versions} from './paths.mjs'
import {withLock} from './state.mjs'
const root='/Users/taylor/.local/state/claude-driver/pressure'
const json=(p,n=16384)=>JSON.parse(readProbeBytes(p,n).bytes.toString('utf8'))
const exact=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).sort().join(',')===keys.sort().join(',')
const refuse=()=>{throw Error('native service ownership evidence refused')}
// Strict bounded tree check: no additional files, linked directories or foreign
// owner are moved. This is filesystem ownership, never native unload evidence.
export function verifyNativeServiceDirectory(dir,hashes){
 const expected=Object.keys(hashes).sort(),actual=[]
 function walk(base,relative=''){
  const st=lstatSync(base);if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==process.getuid())refuse()
  const children=readdirSync(base);if(children.length>8)refuse()
  for(const child of children){const p=relative?relative+'/'+child:child,stat=lstatSync(base+'/'+child)
   if(stat.isSymbolicLink()||stat.uid!==process.getuid())refuse()
   if(stat.isDirectory()){if(!['hooks','.claude-plugin'].includes(p))refuse();walk(base+'/'+child,p)}
   else{if(!stat.isFile()||!expected.includes(p))refuse();actual.push(p);if(readProbeBytes(base+'/'+child).sha256!==hashes[p])refuse()}
  }
 }
 walk(dir);if(actual.sort().join(',')!==expected.join(','))refuse();return true
}
function enrollment(serviceId){
 if(!/^[a-f0-9]{32}$/.test(serviceId))refuse()
 const e=json(root+'/native-service-enrollment-'+serviceId+'.json'),c=e.config,pkg=buildNativePeerServicePackage(c)
 if(!exact(e,['kind','config','epoch','baseline','expectedVersions','dest','hashes'])||e.kind!=='service'||c.id!==serviceId||c.brokerSession!==MOD_PROBE.brokerSession||c.brokerCwd!==MOD_PROBE.brokerCwd||c.build!==MOD_PROBE.brokerBuild||e.epoch?.pid!==MOD_PROBE.pid||e.epoch.procStart!==MOD_PROBE.procStart||e.epoch.build!==c.build||e.dest!=='/Users/taylor/.claude/dev-mods/'+c.brokerSession.slice(6)+'/desktop-bridge-native-peer-service'||JSON.stringify(e.hashes)!==JSON.stringify(pkg.hashes)||!exact(e.baseline,['.claude/settings.json','stop-rescue-policy.json'])||e.baseline['.claude/settings.json']!==MOD_PROBE.settingsHash||e.baseline['stop-rescue-policy.json']!==MOD_PROBE.policyHash||e.expectedVersions?.app!=='2.26454.0'||e.expectedVersions?.cli!=='2.1.289')refuse()
 return e
}
function liveGuard(e){
 const b=brokerInfo(),v=versions(),c=e.config
 if(b.sessionId!==c.brokerSession||b.live?.pid!==e.epoch.pid||b.live.procStart!==e.epoch.procStart||b.live.entrypoint!=='claude-desktop'||b.live.status!=='idle'||b.permissionMode!=='bypassPermissions'||b.runtime?.build!==c.build||!b.runtime.pinned||!b.runtime.integrity||v.app!==e.expectedVersions.app||v.cli!==e.expectedVersions.cli)refuse()
 for(const[p,h]of Object.entries(e.baseline))if(readProbeBytes(c.brokerCwd+'/'+p).sha256!==h)refuse()
 if(['STOP','stop-rescue-arm.json','mechanical-probe.json'].some(p=>probePathPresence(c.brokerCwd+'/'+p)!==false))refuse()
}
// Reads metadata only, without inspectRequest's late reconciliation writes.
function requests(e){
 const ids=new Set(),c=e.config
 for(let slot=0;slot<c.maxRequests;slot++){
  const file=root+'/native-service-budget-'+c.id+'-'+slot+'.json',present=probePathPresence(file)
  if(present===null)refuse();if(!present)continue
  const b=json(file,4096)
  if(!exact(b,['schemaVersion','serviceId','requestId','slot','maxRequests'])||b.schemaVersion!==1||b.serviceId!==c.id||b.slot!==slot||b.maxRequests!==c.maxRequests||!/^rpeer[a-f0-9]{32}$/.test(b.requestId)||ids.has(b.requestId))refuse();ids.add(b.requestId)
 }
 // Detect raw native attempts too; filenames and small ownership metadata only.
 const names=readdirSync(c.brokerCwd).filter(p=>/^\.native-service-rpeer[a-f0-9]{32}\.intent\.json$/.test(p))
 if(names.length>256)refuse()
 for(const name of names){const x=json(c.brokerCwd+'/'+name,4096);if(x.serviceId!==c.id)continue
  if(!exact(x,['schemaVersion','scope','serviceId','requestId','brokerSession','startedAt'])||x.schemaVersion!==1||x.scope!=='owned-native-service-intent'||x.brokerSession!==c.brokerSession||name!=='.native-service-'+x.requestId+'.intent.json')refuse();ids.add(x.requestId)
 }
 const settled=[],unresolved=[]
 for(const id of ids){
  const file=c.brokerCwd+'/results/'+id+'.native.json'
  if(probePathPresence(file)!==true){unresolved.push(id);continue}
  const receipt=json(file,65536),request=json(c.brokerCwd+'/requests/'+id+'.json'),control=json(c.brokerCwd+'/controls/'+id+'.json')
  if(receipt.id!==id||receipt.source!=='native-peer-service-result'||!Array.isArray(receipt.results)||receipt.results.length!==1||receipt.results[0].op!=='get_session'||typeof receipt.results[0].ok!=='boolean'||request.id!==id||request.protocol!==7||request.ops?.length!==1||request.ops[0].op!=='get_session'||!Array.isArray(control.dispatched)||!control.dispatched.includes(0))refuse()
  settled.push(id)
 }
 return {settled,unresolved}
}
export function nativeServiceRetirementEligible(status){
 return status?.filesInstalled===true&&status.filesRetired===false&&status.expired===true&&Array.isArray(status.unresolvedRequests)&&status.unresolvedRequests.length===0
}
export function nativeServiceStatus(serviceId){
 try{
  const e=enrollment(serviceId),c=e.config,retiredDir=root+'/native-service-retired-'+serviceId,presence=probePathPresence(e.dest),retiredPresence=probePathPresence(retiredDir)
  if(presence===null||retiredPresence===null||presence&&retiredPresence)refuse()
  if(presence)verifyNativeServiceDirectory(e.dest,e.hashes)
  if(retiredPresence)verifyNativeServiceDirectory(retiredDir,e.hashes)
  const readyFile=c.brokerCwd+'/.native-service-'+serviceId+'.ready.json',readyPresence=probePathPresence(readyFile)
  if(readyPresence===null)refuse()
  const readinessObserved=readyPresence&&screenNativeServiceReady({config:c,ready:json(readyFile,4096),now:Math.min(Date.now(),c.deadline)})
  const r=requests(e)
  return {serviceId,filesInstalled:presence,filesRetired:retiredPresence,readinessObserved:!!readinessObserved,expired:Date.now()>c.deadline,deadline:c.deadline,maxRequests:c.maxRequests,settledRequests:r.settled.length,unresolvedRequests:r.unresolved,scopedUnloadQualified:false,servingQualified:false,releaseAuthorized:false}
 }catch{throw Object.assign(Error('native service status refused; inspect ownership evidence'),{category:'native_service_status_refused'})}
}
export async function retireNativeService(serviceId,{signal}={}){
 return withLock('broker',()=>{
  let publicationAttempted=false
  try{
   if(signal?.aborted)refuse();const e=enrollment(serviceId);liveGuard(e)
   const status=nativeServiceStatus(serviceId)
   if(!nativeServiceRetirementEligible(status))refuse()
   const dest=root+'/native-service-retired-'+serviceId
   if(probePathPresence(dest)!==false)refuse()
   // Preserve intent before the atomic move. Never resend a request or delete
   // receipt/control history. Caller must inspect a publication uncertainty.
   writeFileSync(root+'/native-service-retirement-intent-'+serviceId+'.json',JSON.stringify({schemaVersion:1,serviceId,from:e.dest,to:dest,at:new Date().toISOString(),scopedUnloadQualified:false})+'\n',{flag:'wx',mode:0o600})
   liveGuard(e);verifyNativeServiceDirectory(e.dest,e.hashes);if(signal?.aborted)refuse()
   publicationAttempted=true;publishNativeServiceDirectory(e.dest,dest)
   verifyNativeServiceDirectory(dest,e.hashes);if(probePathPresence(e.dest)!==false)refuse()
   const receipt={schemaVersion:1,serviceId,filesRetired:true,settledRequests:status.settledRequests,at:new Date().toISOString(),scopedUnloadQualified:false,releaseAuthorized:false}
   writeFileSync(root+'/native-service-retirement-'+serviceId+'.json',JSON.stringify(receipt)+'\n',{flag:'wx',mode:0o600})
   return receipt
  }catch{throw Object.assign(Error('native service retirement refused; inspect exact ownership before retry'),{category:'native_service_retirement_refused',detail:{serviceId,publicationAttempted,retrySafe:false}})}
 },{timeoutMs:5000,signal})
}
