import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {resolve,sep} from 'node:path'
import {PROBE_DIR} from './state.mjs'
// Fixture generator only. No publication, send, or live permission change.
export function buildNativeScratchReadPackage(config){
 const keys=['id','receiver','target','cwd','token','requests','notBefore','deadline']
 if(!config||Object.getPrototypeOf(config)!==Object.prototype||Object.keys(config).sort().join(',')!==keys.sort().join(','))throw Error('invalid scratch probe configuration')
 const sid=/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
 if(!/^[a-f0-9]{32}$/.test(config.id)||!sid.test(config.receiver)||!sid.test(config.target)||config.receiver===config.target||typeof config.cwd!=='string'||config.cwd!==resolve(config.cwd)||!config.cwd.startsWith(resolve(PROBE_DIR)+sep)||!/^claude-driver scratch-read [a-f0-9]{32} $/.test(config.token))throw Error('invalid scratch probe identity')
 if(!Number.isSafeInteger(config.notBefore)||!Number.isSafeInteger(config.deadline)||config.notBefore<0||config.deadline<=config.notBefore||config.deadline-config.notBefore>3600000||!Array.isArray(config.requests)||config.requests.length!==2||new Set(config.requests).size!==2||config.requests.some((v,i)=>v!==config.token+String(i)))throw Error('invalid scratch probe bounds')
 const source=readFileSync(new URL('./native-scratch-read-register.mjs',import.meta.url),'utf8')
 const files={'.claude-plugin/plugin.json':JSON.stringify({name:'desktop-bridge-native-scratch-read',version:'0.1.0',description:'Two fixed-target scratch metadata reads; no mutation or model call'})+'\n','hooks/hooks.json':'{"modules":["./register.js"]}\n','hooks/register.js':'const CONFIG=Object.freeze('+JSON.stringify(config)+');\n'+source}
 return {files,hashes:Object.fromEntries(Object.entries(files).map(([p,v])=>[p,createHash('sha256').update(v).digest('hex')]))}
}
