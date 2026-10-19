import {createHash} from 'node:crypto'
import {buildAdmittedNativePeerPackage} from './native-peer-admitted-package.mjs'
// Native response stays in an owned local file, never the report/transcript.
export function buildNativePeerResultPackage(config){
 const pkg=buildAdmittedNativePeerPackage(config),{probe,requestId}=config
 const resultFile=probe.brokerCwd+'/.native-peer-result-'+probe.id+'.json'
 const marker='outcome.resultWasError=typeof result?.isError===\'boolean\'?result.isError:null'
 const code=pkg.files['hooks/register.js'];if(code.split(marker).length!==2)throw Error('result composition drift')
 const capture=`${marker}
    try{
     const receivedAt=await $.clock.now()
     if(typeof result?.isError==='boolean'&&Array.isArray(result.content)&&Number.isFinite(receivedAt)&&receivedAt>=now&&receivedAt<=deadline&&!await $.fs.exists(${JSON.stringify(resultFile)})){
      const receipt=JSON.stringify({schemaVersion:1,scope:'owned-native-peer-result',probeId:id,requestId:${JSON.stringify(requestId)},brokerSession,targetSession,startedAt:base.startedAt,receivedAt:new Date(receivedAt).toISOString(),isError:result.isError,content:result.content})+'\\n'
      if(receipt.length<=65536)await $.fs.write(${JSON.stringify(resultFile)},receipt)
     }
    }catch{} // Missing response file remains unresolved; never replay the call.`
 const files={...pkg.files,'hooks/register.js':code.replace(marker,capture),'.claude-plugin/plugin.json':JSON.stringify({name:'desktop-bridge-native-peer-result-read',version:'0.7.0',description:'One admitted native read with private durable response'})+'\n'}
 return {...pkg,files,resultFile,hashes:Object.fromEntries(Object.entries(files).map(([p,text])=>[p,createHash('sha256').update(text).digest('hex')]))}
}
