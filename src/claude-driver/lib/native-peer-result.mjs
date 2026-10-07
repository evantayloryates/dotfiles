import {readProbeBytes,probePathPresence} from './native-mod-probe-evidence.mjs'
import {screenNativePeerEvidence,screenNativePeerAdmission} from './native-peer-evidence.mjs'
import {buildNativePeerResultPackage} from './native-peer-result-package.mjs'
import {brokerInfo} from './broker.mjs'
import {versions} from './paths.mjs'
import {withLock,writeJsonAtomic} from './state.mjs'
import {nativeResultFile} from './requests.mjs'
const root='/Users/taylor/.local/state/claude-driver/pressure/'
const json=(p,limit=16384)=>JSON.parse(readProbeBytes(p,limit).bytes.toString('utf8'))
const refuse=()=>{throw Object.assign(Error('native callback result evidence refused; no result published'),{category:'native_callback_result_refused'})}
export function screenNativePeerResult({config,requestId,report,receipt,admission}={}){
 if(!config||!report||!admission||typeof requestId!=='string'||!Number.isFinite(config.deadline)||!Number.isFinite(Date.parse(report.startedAt))||!Number.isFinite(Date.parse(report.completedAt)))return null
 const keys=['schemaVersion','scope','probeId','requestId','brokerSession','targetSession','startedAt','receivedAt','isError','content']
 if(!receipt||typeof receipt!=='object'||Array.isArray(receipt)||Object.keys(receipt).sort().join(',')!==keys.sort().join(',')||receipt.schemaVersion!==1||receipt.scope!=='owned-native-peer-result'||receipt.probeId!==config.id||receipt.requestId!==requestId||receipt.brokerSession!==config.brokerSession||receipt.targetSession!==config.targetSession||receipt.startedAt!==report.startedAt||!admission.singleReadAdmissionObserved||typeof receipt.isError!=='boolean'||receipt.isError!==report.resultWasError)return null
 const at=Date.parse(receipt.receivedAt),end=Date.parse(report.completedAt)
 if(typeof receipt.receivedAt!=='string'||!Number.isFinite(at)||new Date(at).toISOString()!==receipt.receivedAt||at<Date.parse(report.startedAt)||at>end||at>config.deadline||!Array.isArray(receipt.content)||receipt.content.length>64||receipt.content.some(b=>!b||Object.keys(b).sort().join(',')!=='text,type'||b.type!=='text'||typeof b.text!=='string'))return null
 const text=receipt.content.map(b=>b.text).join('\n');if(Buffer.byteLength(text)>65536)return null
 // Transport success is insufficient: the returned metadata must describe
 // the exact admitted target, matching the existing native batch contract.
 if(!receipt.isError){
  let metadata;try{metadata=JSON.parse(text)}catch{return null}
  if(!metadata||typeof metadata!=='object'||Array.isArray(metadata)||metadata.sessionId!==config.targetSession||typeof metadata.isArchived!=='boolean'||typeof metadata.isRunning!=='boolean'||Object.hasOwn(metadata,'pinned')&&typeof metadata.pinned!=='boolean')return null
 }
 return {ok:!receipt.isError,...(receipt.isError?{error:text}:{result:text})}
}
// Explicit, read-only evidence review plus one locked receipt publication. No
// sends, tool execution, replay, policy changes or lifecycle history rewriting.
export async function reconcileNativePeerResult(id){
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id))refuse()
 const enrollment=json(root+'native-peer-enrollment-'+id+'.json'),{config,requestId,epoch,dest}=enrollment
 if(enrollment.kind!=='result'||config?.id!==id||requestId!=='rpeer'+id.replaceAll('-','')||dest!=='/Users/taylor/.claude/dev-mods/'+config.brokerSession.slice(6)+'/desktop-bridge-native-peer-result-read')refuse()
 const pkg=buildNativePeerResultPackage({probe:config,requestId,build:epoch.build})
 for(const[p,h]of Object.entries(pkg.hashes))if(enrollment.hashes?.[p]!==h||readProbeBytes(dest+'/'+p).sha256!==h)refuse()
 const b=brokerInfo(),v=versions();if(b.sessionId!==config.brokerSession||b.live?.pid!==epoch.pid||b.live.procStart!==epoch.procStart||b.live.entrypoint!=='claude-desktop'||b.runtime?.build!==epoch.build||!b.runtime.pinned||!b.runtime.integrity||v.app!=='2.26454.0'||v.cli!=='2.1.289')refuse()
 if(!enrollment.baseline||Object.keys(enrollment.baseline).sort().join(',')!=='.claude/settings.json,stop-rescue-policy.json'||Object.values(enrollment.baseline).some(h=>typeof h!=='string'||! /^[a-f0-9]{64}$/.test(h)))refuse()
 for(const[p,h]of Object.entries(enrollment.baseline))if(readProbeBytes(config.brokerCwd+'/'+p).sha256!==h)refuse()
 return withLock('request-'+requestId,()=>{
  const request=json(config.brokerCwd+'/requests/'+requestId+'.json'),control=json(config.brokerCwd+'/controls/'+requestId+'.json'),pointer=json(config.brokerCwd+'/runtime.json'),entry=json(config.brokerCwd+'/broker-check-entry.json'),nativeAdmission=json(config.brokerCwd+'/native-admission-'+requestId+'-0.json'),report=json(config.report,4096),ready=json(config.ready,4096),intent=json(config.intent,4096),receipt=json(pkg.resultFile,65536)
  if(!screenNativePeerEvidence({config,ready,intent,report}).consistent)refuse()
  const admission=screenNativePeerAdmission({config,epoch,pointer,request,entry,admission:nativeAdmission,control,report}),result=screenNativePeerResult({config,requestId,report,receipt,admission});if(!result)refuse()
  const native={id:requestId,source:'native-peer-tool-result',results:[{op:'get_session',...result,nativeToolUseId:nativeAdmission.toolUseId}]},file=nativeResultFile(requestId),presence=probePathPresence(file)
  if(presence!==false){if(presence===null||JSON.stringify(json(file,65536))!==JSON.stringify(native))refuse()}
  else writeJsonAtomic(file,native)
  return {requestId,receiptVerified:true,state:result.ok?'completed':'failed',source:native.source,published:presence===false,controlHistoryPreserved:true,releaseAuthorized:false}
 },{timeoutMs:5000})
}
