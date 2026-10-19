import {createHash} from 'node:crypto'
import {buildNativePeerPackage} from './native-peer-package.mjs'
// Pure staging; claim/checkpoint creation belongs to existing lifecycle helpers.
export function buildAdmittedNativePeerPackage({probe,requestId,build}){
 if(!/^rpeer[a-f0-9]{32}$/.test(requestId)||! /^[a-f0-9]{64}$/.test(build))throw Error('invalid admitted package identity')
 if(requestId!=='rpeer'+probe.id.replaceAll('-',''))throw Error('request and probe identity differ')
 const pkg=buildNativePeerPackage(probe),command=`/opt/homebrew/bin/node "/Users/taylor/.local/state/claude-driver/releases/${build}/scripts/broker-check.mjs" ${requestId} 0 --dir "${probe.brokerCwd}"`
 const marker="const result=await $.mcp.call('ccd_session_mgmt','get_session',{session_id:targetSession})"
 const code=pkg.files['hooks/register.js'];if(code.split(marker).length!==2)throw Error('probe source composition drift')
 const admitted=`const checkpoint=await $.tool.call({tool:'Bash',command:${JSON.stringify(command)},timeout:5000,run_in_background:false})
    if(checkpoint?.deny!==undefined||checkpoint?.isError===true||typeof checkpoint?.text!=='string')throw Error('admitted-checkpoint-refused')
    let checked;try{checked=JSON.parse(checkpoint.text.trim())}catch{throw Error('admitted-checkpoint-refused')}
    if(checked?.dispatch!==true||checked.op!=='get_session'||Object.keys(checked).sort().join(',')!=='args,dispatch,op'||!checked.args||Object.keys(checked.args).join(',')!=='session_id'||checked.args.session_id!==targetSession)throw Error('admitted-checkpoint-refused')
    ${marker}`
 const files={...pkg.files,'hooks/register.js':code.replace(marker,admitted),'.claude-plugin/plugin.json':JSON.stringify({name:'desktop-bridge-native-peer-admitted-read',version:'0.6.0',description:'One exact lifecycle-admitted native read'})+'\n'}
 return {files,hashes:Object.fromEntries(Object.entries(files).map(([p,text])=>[p,createHash('sha256').update(text).digest('hex')])),command,requestId}
}
