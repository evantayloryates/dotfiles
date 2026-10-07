import {readProbeBytes,probePathPresence} from './native-mod-probe-evidence.mjs'
import {buildNativePeerServicePackage} from './native-peer-service-package.mjs'
import {screenNativeServiceResult} from './native-peer-service-evidence.mjs'
import {brokerInfo} from './broker.mjs'
import {versions} from './paths.mjs'
import {withLock,writeJsonAtomic} from './state.mjs'
import {nativeResultFile} from './requests.mjs'
const root='/Users/taylor/.local/state/claude-driver/pressure/'
const json=(path,limit=16384)=>JSON.parse(readProbeBytes(path,limit).bytes.toString('utf8'))
const refuse=()=>{throw Error('service result evidence refused')}
// Never sends or replays. New runtimes retain a scoped completed checkpoint;
// legacy runtimes still require settlement before the shared entry is replaced. All errors are sanitized, including JSON errors.
export async function reconcileNativeServiceResult(serviceId,requestId){
 try{return await reconcile(serviceId,requestId)}catch{throw Object.assign(Error('native service result evidence refused; no replay'),{category:'native_service_result_refused'})}
}
async function reconcile(serviceId,requestId){
 if(!/^[a-f0-9]{32}$/.test(serviceId)||!/^rpeer[a-f0-9]{32}$/.test(requestId))refuse()
 const enrollment=json(root+'native-service-enrollment-'+serviceId+'.json'),{config,epoch,dest,baseline,expectedVersions}=enrollment
 const pkg=buildNativePeerServicePackage(config)
 if(enrollment.kind!=='service'||config.id!==serviceId||epoch?.build!==config.build||dest!=='/Users/taylor/.claude/dev-mods/'+config.brokerSession.slice(6)+'/desktop-bridge-native-peer-service')refuse()
 return withLock('request-'+requestId,()=>{
  for(const[p,h]of Object.entries(pkg.hashes))if(enrollment.hashes?.[p]!==h||readProbeBytes(dest+'/'+p).sha256!==h)refuse()
  const broker=brokerInfo(),v=versions()
  if(broker.sessionId!==config.brokerSession||broker.live?.pid!==epoch.pid||broker.live.procStart!==epoch.procStart||broker.live.entrypoint!=='claude-desktop'||broker.runtime?.build!==epoch.build||!broker.runtime.pinned||!broker.runtime.integrity||expectedVersions?.app!=='2.26454.0'||expectedVersions?.cli!=='2.1.289'||v.app!==expectedVersions.app||v.cli!==expectedVersions.cli)refuse()
  if(!baseline||Object.keys(baseline).sort().join(',')!=='.claude/settings.json,stop-rescue-policy.json')refuse()
  for(const[p,h]of Object.entries(baseline))if(typeof h!=='string'||! /^[a-f0-9]{64}$/.test(h)||readProbeBytes(config.brokerCwd+'/'+p).sha256!==h)refuse()
  const cwd=config.brokerCwd,ready=json(cwd+'/.native-service-'+serviceId+'.ready.json',4096),intent=json(cwd+'/.native-service-'+requestId+'.intent.json',4096),receipt=json(cwd+'/.native-service-'+requestId+'.result.json',65536),request=json(cwd+'/requests/'+requestId+'.json'),pointer=json(cwd+'/runtime.json'),admission=json(cwd+'/native-admission-'+requestId+'-0.json'),control=json(cwd+'/controls/'+requestId+'.json')
  if(!Number.isInteger(pointer.generation)||pointer.generation<1)refuse()
  const scoped=cwd+'/broker-check-'+requestId+'-0-g'+pointer.generation+'.completed.json',scopedPresence=probePathPresence(scoped)
  if(scopedPresence===null)refuse()
  const entry=json(scopedPresence===false?cwd+'/broker-check-entry.json':scoped)
  const reviewed=screenNativeServiceResult({config,ready,intent,receipt,request,epoch,pointer,entry,admission,control})
  if(!reviewed.receiptVerified)refuse()
  const native={id:requestId,source:'native-peer-service-result',results:[{op:'get_session',...reviewed.result,nativeToolUseId:reviewed.nativeToolUseId}]},file=nativeResultFile(requestId),presence=probePathPresence(file)
  if(file!==cwd+'/results/'+requestId+'.native.json')refuse()
  if(presence!==false){if(presence===null||JSON.stringify(json(file,65536))!==JSON.stringify(native))refuse()}
  else writeJsonAtomic(file,native)
  return {serviceId,requestId,receiptVerified:true,state:reviewed.result.ok?'completed':'failed',source:native.source,published:presence===false,controlHistoryPreserved:true,releaseAuthorized:false}
 },{timeoutMs:5000})
}
