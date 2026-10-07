// Screening for this staged, single read experiment. Report text is untrusted;
// these checks cannot prove plugin loading, gate execution or a model-free turn.
import {createHash} from 'node:crypto'
import {constants,openSync,closeSync,fstatSync,readSync,lstatSync} from 'node:fs'

export const MOD_PROBE=Object.freeze({
 id:'ddc7012b-e98f-4077-bc21-ae68d4f50406',version:'0.2.0',
 brokerSession:'local_35b3ba48-f02e-48de-bfbb-925192d90de1',
 cliSessionId:'35b3ba48-f02e-48de-bfbb-925192d90de1',
 brokerCwd:'/Users/taylor/.local/state/claude-driver/broker',
 targetSession:'local_fc1e5eab-9d24-4e4c-a09c-9a386a6ffe14',
 reportName:'native-mod-probe-ddc7012b-e98f-4077-bc21-ae68d4f50406.report.json',
 settingsHash:'d66115ffaba3cc0c723795ad4ffcee692e464e6afc8e921c3d50dafc4bc78b74',
 policyHash:'7a8ce57affbfcf0fec640e7bba45cd2c26f9e16055404a2ae45a67fc699fb5f1',
 pid:71262,procStart:'Wed Oct  7 03:24:51 2026',
 brokerBuild:'4af08654459f514c1e0d76f0071b54ddb6e22e1805bbb7db101a632d0a387912',
 notBefore:Date.parse('2026-10-07T10:36:33.261Z'),
 files:Object.freeze({
  '.claude-plugin/plugin.json':'da9d8573a8e656cdc88a4eb355ee3f4cf24f5fbf1313200ae12400b503513cfa',
  'hooks/hooks.json':'ac225d373dd34c3042e759b35f80a821560822227303353464eca00ec6e03d96',
  'hooks/register.js':'3a7b1e8c083d24ce932e54a0e61894d723178c46952bf78982a91613f9e9183c'
 })
})
const keys=['schemaVersion','scope','probeId','pluginVersion','brokerSession','brokerCwd','targetSession','startedAt','complete','nativeCallReturned','resultWasError','gateQualified','releaseAuthorized','modelCallsRequested','nativeModelTurnsQualified','completedAt']
const intentKeys=['schemaVersion','scope','probeId','pluginVersion','brokerSession','targetSession','startedAt','complete','gateQualified','releaseAuthorized']
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)
const exactKeys=(x,allowed,optional=[])=>object(x)&&Object.keys(x).every(k=>allowed.includes(k))&&allowed.filter(k=>!optional.includes(k)).every(k=>Object.hasOwn(x,k))
const iso=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(Date.parse(x)).toISOString()===x

export function readProbeBytes(file,maxBytes=16384){
 let fd
 try{
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>65536)throw Error('invalid bound')
  fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK)
  const before=fstatSync(fd)
  if(!before.isFile()||before.uid!==process.getuid()||before.size>maxBytes)throw Error('unavailable')
  const bytes=Buffer.alloc(before.size)
  let offset=0
  while(offset<bytes.length){const n=readSync(fd,bytes,offset,bytes.length-offset,offset);if(!n)throw Error('changed');offset+=n}
  const after=fstatSync(fd)
  if(after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs)throw Error('changed')
  return {bytes,sha256:createHash('sha256').update(bytes).digest('hex')}
 }catch{throw Error('probe evidence is unavailable, oversized or changed')}
 finally{if(fd!==undefined)closeSync(fd)}
}

// An unreadable path is not proof that a control marker is absent.
export function probePathPresence(file){
 try{lstatSync(file);return true}catch(e){return e.code==='ENOENT'?false:null}
}

export function screenProbeReport(bytes,{sha256,intent,now=Date.now(),experiment=MOD_PROBE}={}){
 const refuse=()=>({reportConsistent:false,reason:'probe-report-inconsistent',gateQualified:false,releaseAuthorized:false})
 try{
  if(!Buffer.isBuffer(bytes)||bytes.length>4096||!Number.isFinite(now)||!Number.isFinite(experiment.notBefore)||!(/^[a-f0-9]{64}$/.test(sha256||''))||createHash('sha256').update(bytes).digest('hex')!==sha256)return refuse()
  const x=JSON.parse(bytes.toString('utf8')),p=experiment
  if(!exactKeys(x,p.diagnostic?[...keys,'failureCategory']:keys,['completedAt'])||x.schemaVersion!==1||x.scope!==(p.scope||'owned-native-mod-read-probe')||x.probeId!==p.id||x.pluginVersion!==p.version||x.brokerSession!==p.brokerSession||x.brokerCwd!==p.brokerCwd||x.targetSession!==p.targetSession||x.complete!==true||typeof x.nativeCallReturned!=='boolean'||!(x.resultWasError===null||typeof x.resultWasError==='boolean')||!x.nativeCallReturned&&x.resultWasError!==null||x.gateQualified!==false||x.releaseAuthorized!==false||x.modelCallsRequested!==0||x.nativeModelTurnsQualified!==false||!iso(x.startedAt)||Date.parse(x.startedAt)<p.notBefore||Date.parse(x.startedAt)>now)return refuse()
  if(p.diagnostic&&((x.nativeCallReturned&&x.failureCategory!==null)||(!x.nativeCallReturned&&!['mcp-tool-unavailable','tool-hidden-or-unavailable','tool-pipeline-no-result','broker-dispatch-gate-refusal','tool-permission-refusal','unidentified-exception'].includes(x.failureCategory))))return refuse()
  if(Object.hasOwn(x,'completedAt')&&(!iso(x.completedAt)||Date.parse(x.completedAt)<Date.parse(x.startedAt)||Date.parse(x.completedAt)>now))return refuse()
  if(!exactKeys(intent,intentKeys)||intent.schemaVersion!==1||intent.scope!==((p.scope||'owned-native-mod-read-probe')+'-intent')||intent.probeId!==p.id||intent.pluginVersion!==p.version||intent.brokerSession!==p.brokerSession||intent.targetSession!==p.targetSession||intent.startedAt!==x.startedAt||intent.complete!==false||intent.gateQualified!==false||intent.releaseAuthorized!==false)return refuse()
  // Only a fixed allowlist leaves this function. Report assertions stay labelled.
  return {reportConsistent:true,probeId:p.id,reported:{startedAt:x.startedAt,completedAt:x.completedAt??null,nativeCallReturned:x.nativeCallReturned,resultWasError:x.resultWasError,modelCallsRequested:0,...p.diagnostic&&{failureCategory:x.failureCategory}},gateQualified:false,releaseAuthorized:false}
 }catch{return refuse()}
}

export function screenProbeState({report,versions,broker,settingsHash,policyHash,sourceFiles,installedFiles,stopped,armed,diagnostic,experiment=MOD_PROBE}){
 const p=experiment
 const checks={
  reportConsistent:report?.reportConsistent===true,
  reviewedVersions:versions?.app==='2.26454.0'&&versions?.cli==='2.1.289',
  sameNativeMetadataEpoch:broker?.sessionId===p.brokerSession&&broker.live?.pid===p.pid&&broker.live?.procStart===p.procStart&&broker.live?.entrypoint==='claude-desktop',
  originalRuntime:broker?.runtime?.pinned===true&&broker.runtime.integrity===true&&broker.runtime.build===p.brokerBuild,
  originalSettings:settingsHash===p.settingsHash&&policyHash===p.policyHash,
  originalSourceFiles:Object.entries(p.files).every(([file,hash])=>sourceFiles?.[file]===hash),
  copiedFilesMatch:Object.entries(p.files).every(([file,hash])=>installedFiles?.[file]===hash),
  noPendingControl:stopped===false&&armed===false&&diagnostic===false
 }
 return {eligibleForNativeReview:Object.values(checks).every(x=>x===true),checks,pluginLoadedQualified:false,nativeEpochKernelQualified:false,nativeGateQualified:false,nativeModelTurnsQualified:false,scopedUnloadQualified:false,releaseAuthorized:false,
  required:'Independently bind real loaded bytes, kernel process, command ancestry, native admission denial, model events, fixture state and scoped unload; files and reported outcome alone are not execution proof.'}
}
