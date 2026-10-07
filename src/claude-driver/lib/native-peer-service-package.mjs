import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
// Pure candidate generator. No installation, sends or receipt qualification.
export function buildNativePeerServicePackage(config){
 const keys=['id','token','brokerSession','brokerCwd','build','notBefore','deadline','maxRequests']
 if(!config||Object.getPrototypeOf(config)!==Object.prototype||Object.keys(config).sort().join(',')!==keys.sort().join(','))throw Error('invalid service configuration')
 if(!/^[a-f0-9]{32}$/.test(config.id)||!/^claude-driver service-read [a-f0-9]{32}$/.test(config.token)||!/^local_[a-f0-9-]{36}$/.test(config.brokerSession)||config.brokerCwd!=='/Users/taylor/.local/state/claude-driver/broker'||! /^[a-f0-9]{64}$/.test(config.build))throw Error('invalid service identity')
 if(!Number.isSafeInteger(config.notBefore)||!Number.isSafeInteger(config.deadline)||config.deadline<=config.notBefore||config.deadline-config.notBefore>3600000||!Number.isInteger(config.maxRequests)||config.maxRequests<1||config.maxRequests>128)throw Error('invalid service bounds')
 const source=readFileSync(new URL('../candidates/native-peer-service/register.js',import.meta.url),'utf8')
 const files={'.claude-plugin/plugin.json':JSON.stringify({name:'desktop-bridge-native-peer-service',version:'0.1.0',description:'Bounded lifecycle-admitted metadata receiver candidate'})+'\n','hooks/hooks.json':'{"modules":["./register.js"]}\n','hooks/register.js':'const CONFIG=Object.freeze('+JSON.stringify(config)+');\n'+source}
 return {files,hashes:Object.fromEntries(Object.entries(files).map(([p,s])=>[p,createHash('sha256').update(s).digest('hex')]))}
}
