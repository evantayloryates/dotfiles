import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {buildNativeResourceProgram} from './native-resource-program.mjs'
import {dirname,join} from 'node:path'
import {serviceStateBindingMatches} from './runtime-entry.mjs'
import {metadataTargetValid} from './native-metadata-control.mjs'
import {archiveTargetValid} from './native-archive-control.mjs'
// Pure candidate generator. No installation, sends or receipt qualification.
export function buildNativePeerServicePackage(config){
 const marked=config?.marker===true
 const resource=config?.resourceProbe===true
 const controlCheck=config?.controlCheck===true
 const bound=config?.serviceStateBinding!==undefined
 const archive=config?.archiveTarget!==undefined
 const metadata=config?.metadataTarget!==undefined
 const keys=['id','token','brokerSession','brokerCwd','build','notBefore','deadline','maxRequests',...bound?['serviceStateBinding']:[],...archive?['archiveTarget']:[],...metadata?['metadataTarget']:[],...config?.metadataModelControl!==undefined?['metadataModelControl']:[],...config?.metadataSendControl!==undefined?['metadataSendControl']:[],...config?.metadataStopControl!==undefined?['metadataStopControl']:[],...config?.sessionManagementControl!==undefined?['sessionManagementControl']:[],...config?.sessionMetadataControl!==undefined?['sessionMetadataControl']:[],...config?.sessionSendControl!==undefined?['sessionSendControl']:[],...marked?['marker','observeRetiredServiceId']:[],...resource?['resourceProbe']:[],...controlCheck?['controlCheck']:[]]
 if(!config||Object.getPrototypeOf(config)!==Object.prototype||Object.keys(config).sort().join(',')!==keys.sort().join(','))throw Error('invalid service configuration')
 if(!/^[a-f0-9]{32}$/.test(config.id)||!/^claude-driver service-read [a-f0-9]{32}$/.test(config.token)||!/^local_[a-f0-9-]{36}$/.test(config.brokerSession)||! /^[a-f0-9]{64}$/.test(config.build))throw Error('invalid service identity')
 if(bound){if(resource||config.serviceStateBinding.id!==config.id||!serviceStateBindingMatches({binding:config.serviceStateBinding,dir:config.brokerCwd,sessionId:config.brokerSession,build:config.build,receiverCwd:config.serviceStateBinding.receiverCwd}))throw Error('invalid service state binding')}
 else if(config.brokerCwd!=='/Users/taylor/.local/state/claude-driver/broker')throw Error('invalid service identity')
 if(config.sessionSendControl!==undefined&&(config.sessionSendControl!==true||config.sessionManagementControl!==true))throw Error('ordinary send requires explicit management and send grants')
 if(config.sessionMetadataControl!==undefined&&(config.sessionMetadataControl!==true||config.sessionManagementControl!==true))throw Error('ordinary metadata requires explicit management and metadata grants')
 if(config.sessionManagementControl!==undefined&&(config.sessionManagementControl!==true||!bound||archive||marked||controlCheck))throw Error('invalid ordinary session capability')
 if(archive&&(!bound||!archiveTargetValid(config.archiveTarget,config.serviceStateBinding)))throw Error('invalid archive target')
 if(config.metadataStopControl!==undefined&&(config.metadataStopControl!==true||!metadata))throw Error('invalid native stop capability')
 if(config.metadataSendControl!==undefined&&(config.metadataSendControl!==true||!metadata))throw Error('invalid native send capability')
 if(config.metadataModelControl!==undefined&&(config.metadataModelControl!==true||!metadata))throw Error('invalid metadata model capability')
 if(metadata&&(!bound||archive||marked||controlCheck||!metadataTargetValid(config.metadataTarget,config.serviceStateBinding)))throw Error('invalid metadata target')
 if(!Number.isSafeInteger(config.notBefore)||!Number.isSafeInteger(config.deadline)||config.deadline<=config.notBefore||config.deadline-config.notBefore>3600000||!Number.isInteger(config.maxRequests)||config.maxRequests<1||config.maxRequests>128)throw Error('invalid service bounds')
 if(marked&&!(config.observeRetiredServiceId===null||(/^[a-f0-9]{32}$/.test(config.observeRetiredServiceId)&&config.observeRetiredServiceId!==config.id)))throw Error('invalid previous marker identity')
 if(resource&&(!marked||config.deadline-config.notBefore>120000))throw Error('invalid resource probe bounds')
 let source=readFileSync(new URL('../candidates/native-peer-service/register.js',import.meta.url),'utf8')
 if(marked){
  const begin=source.indexOf('async function recordServiceReady('),end=source.indexOf('async function receiveServiceRead(',begin)
  if(begin<0||end<=begin)throw Error('service readiness source boundary changed')
  source=source.slice(0,begin)+source.slice(end)
  source=source.replace("on('session.start',recordServiceReady)","on('session.start',recordServiceReady);on('command.run',{command:'claude-driver-service-marker-'+CONFIG.id},runServiceMarker)")+'\n'+readFileSync(new URL('../candidates/native-peer-service/marker.js',import.meta.url),'utf8')
  if(resource){
   const marker=readFileSync(new URL('../candidates/native-peer-service/resource.js',import.meta.url),'utf8')
   const boundary=' }catch{}\n return next(event)\n}'
   if(source.split(boundary).length!==2)throw Error('resource registration boundary changed')
   source=source.replace(boundary,marker+'\n'+boundary)
   source='const RESOURCE_PROGRAM='+JSON.stringify(buildNativeResourceProgram({serviceId:config.id,deadline:config.deadline+30000,evidenceRoot:config.brokerCwd}))+';\n'+source
  }
 }
 if(controlCheck){
  const boundary='  // Target comes only from the sealed lifecycle checkpoint, never peer text.'
  if(source.split(boundary).length!==2)throw Error('control check source boundary changed')
  source=source.replace(boundary,readFileSync(new URL('../candidates/native-peer-service/control-check.js',import.meta.url),'utf8')+'\n'+boundary)
 }
 const quote=x=>"'"+x.replaceAll("'","'\\''")+"'",checkpoint=join(bound?dirname(config.brokerCwd):'/Users/taylor/.local/state/claude-driver','releases',config.build,'scripts/broker-check.mjs')
 const constants='const RECEIVER_CWD='+JSON.stringify(bound?config.serviceStateBinding.receiverCwd:config.brokerCwd)+',CHECKPOINT_PREFIX='+JSON.stringify('/opt/homebrew/bin/node '+quote(checkpoint)+' ')+',CHECKPOINT_DIR='+JSON.stringify(quote(config.brokerCwd))+';\n'
 const files={'.claude-plugin/plugin.json':JSON.stringify({name:'desktop-bridge-native-peer-service',version:config.sessionSendControl?'0.12.0':config.sessionMetadataControl?'0.11.0':config.sessionManagementControl?'0.10.0':config.metadataStopControl?'0.9.0':config.metadataSendControl?'0.8.0':config.metadataModelControl?'0.7.0':metadata?'0.6.0':bound?'0.5.0':controlCheck?'0.4.0':resource?'0.3.0':marked?'0.2.0':'0.1.0',description:'Bounded lifecycle-admitted metadata receiver candidate'})+'\n','hooks/hooks.json':'{"modules":["./register.js"]}\n','hooks/register.js':'const CONFIG=Object.freeze('+JSON.stringify(config)+');\n'+constants+source}
 return {files,hashes:Object.fromEntries(Object.entries(files).map(([p,s])=>[p,createHash('sha256').update(s).digest('hex')]))}
}
