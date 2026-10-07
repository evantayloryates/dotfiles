import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
// Pure candidate generator. No installation, sends or receipt qualification.
export function buildNativePeerServicePackage(config){
 const marked=config?.marker===true
 const keys=['id','token','brokerSession','brokerCwd','build','notBefore','deadline','maxRequests',...marked?['marker','observeRetiredServiceId']:[]]
 if(!config||Object.getPrototypeOf(config)!==Object.prototype||Object.keys(config).sort().join(',')!==keys.sort().join(','))throw Error('invalid service configuration')
 if(!/^[a-f0-9]{32}$/.test(config.id)||!/^claude-driver service-read [a-f0-9]{32}$/.test(config.token)||!/^local_[a-f0-9-]{36}$/.test(config.brokerSession)||config.brokerCwd!=='/Users/taylor/.local/state/claude-driver/broker'||! /^[a-f0-9]{64}$/.test(config.build))throw Error('invalid service identity')
 if(!Number.isSafeInteger(config.notBefore)||!Number.isSafeInteger(config.deadline)||config.deadline<=config.notBefore||config.deadline-config.notBefore>3600000||!Number.isInteger(config.maxRequests)||config.maxRequests<1||config.maxRequests>128)throw Error('invalid service bounds')
 if(marked&&!(config.observeRetiredServiceId===null||(/^[a-f0-9]{32}$/.test(config.observeRetiredServiceId)&&config.observeRetiredServiceId!==config.id)))throw Error('invalid previous marker identity')
 let source=readFileSync(new URL('../candidates/native-peer-service/register.js',import.meta.url),'utf8')
 if(marked){
  const begin=source.indexOf('async function recordServiceReady('),end=source.indexOf('async function receiveServiceRead(',begin)
  if(begin<0||end<=begin)throw Error('service readiness source boundary changed')
  source=source.slice(0,begin)+source.slice(end)
  source=source.replace("on('session.start',recordServiceReady)","on('session.start',recordServiceReady);on('command.run',{command:'claude-driver-service-marker-'+CONFIG.id},runServiceMarker)")+'\n'+readFileSync(new URL('../candidates/native-peer-service/marker.js',import.meta.url),'utf8')
 }
 const files={'.claude-plugin/plugin.json':JSON.stringify({name:'desktop-bridge-native-peer-service',version:marked?'0.2.0':'0.1.0',description:'Bounded lifecycle-admitted metadata receiver candidate'})+'\n','hooks/hooks.json':'{"modules":["./register.js"]}\n','hooks/register.js':'const CONFIG=Object.freeze('+JSON.stringify(config)+');\n'+source}
 return {files,hashes:Object.fromEntries(Object.entries(files).map(([p,s])=>[p,createHash('sha256').update(s).digest('hex')]))}
}
