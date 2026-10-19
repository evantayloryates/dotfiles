import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
// Pure staging: emits bytes only. No installation, delivery or native calls.
export function buildNativePeerPackage(config){
 if(!config||typeof config!=='object'||Object.getPrototypeOf(config)!==Object.prototype)throw Error('invalid fixed package configuration')
 const keys=['id','token','brokerSession','brokerCwd','targetSession','ready','intent','report','notBefore','deadline']
 if(Object.keys(config).length!==keys.length||keys.some(k=>!Object.hasOwn(config,k)))throw Error('unexpected package configuration')
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(config.id)||!/^claude-driver native-check [a-f0-9]{32}$/.test(config.token))throw Error('invalid package identity')
 if(!/^local_[a-f0-9-]{36}$/.test(config.brokerSession)||!/^local_[a-f0-9-]{36}$/.test(config.targetSession)||config.brokerSession===config.targetSession)throw Error('invalid owned sessions')
 const cwd='/Users/taylor/.local/state/claude-driver/broker',reports='/Users/taylor/Desktop/temp_reports/'
 if(config.brokerCwd!==cwd||config.intent!==`${cwd}/.native-peer-read-${config.id}.started.json`||config.ready!==`${reports}native-peer-ready-${config.id}.json`||config.report!==`${reports}native-peer-read-${config.id}.report.json`)throw Error('invalid evidence paths')
 if(!Number.isSafeInteger(config.notBefore)||!Number.isSafeInteger(config.deadline)||config.deadline<=config.notBefore||config.deadline-config.notBefore>300000)throw Error('invalid bounded window')
 const parts=['receive.js','probe.js','enroll.js'].map(name=>readFileSync(new URL('../candidates/native-peer-trigger/'+name,import.meta.url),'utf8').replace(/^import .*\n/gm,'').replace(/^export function /gm,'function '))
 const diagnostic=readFileSync(new URL('../candidates/native-mod-probe/diagnostic-failure.js',import.meta.url),'utf8').replace(/^export function /gm,'function ')
 // Native mod validator requires $ callees to be top-level declarations.
 // Flatten the probe factory in emitted bytes; retain factories for host tests.
 const probe=parts[1],body=probe.slice(probe.indexOf('return async $=>{')+'return async $=>{'.length,probe.lastIndexOf('\n }\n}'))
 const receive=parts[0].replace(',run})', '})').replace("||typeof run!=='function'",'').replace('await run($)','await runReadProbe($)')
 const enroll=parts[2].replace(' const run=createDurableReadProbe(config)\n','').replace('{...config,run}','config')
 const fixed='const CONFIG=Object.freeze('+JSON.stringify(config)+');\nconst {id,intent,report,brokerSession,targetSession,notBefore,deadline}=CONFIG;\nlet attempted=false;\nasync function runReadProbe($){'+body+'\n}\n'
 const module=diagnostic+'\n'+fixed+receive+'\n'+enroll+'\nexport function register(on){enrollPeerReadProbe(on,CONFIG)}\n'
 const files={'.claude-plugin/plugin.json':JSON.stringify({name:'desktop-bridge-native-peer-read',version:'0.5.0',description:'One fixed peer read probe; passive enrollment'})+'\n','hooks/hooks.json':'{"modules":["./register.js"]}\n','hooks/register.js':module}
 return {files,hashes:Object.fromEntries(Object.entries(files).map(([path,text])=>[path,createHash('sha256').update(text).digest('hex')]))}
}
