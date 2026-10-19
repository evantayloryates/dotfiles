#!/usr/bin/env node
import {spawn} from 'node:child_process'
import {createInterface} from 'node:readline'
import {fileURLToPath} from 'node:url'
import {readFileSync,appendFileSync} from 'node:fs'
import {NATIVE_CONTRACT_TOOLS,permittedNativeContractCall,nativeContractReplyEvidence} from './native-service-contract.mjs'
const file=process.env.CLAUDE_DRIVER_NATIVE_CONTRACT;if(!file)throw Error('native contract required')
const c=JSON.parse(readFileSync(file,'utf8')),jobs=new Set(),calls=new Map(),lists=new Set(),send=x=>process.stdout.write(JSON.stringify(x)+'\n'),trace=x=>appendFileSync(c.trace,JSON.stringify({at:Date.now(),...x})+'\n',{mode:0o600})
const child=spawn(fileURLToPath(new URL('../launch',import.meta.url)),[],{env:process.env,stdio:['pipe','pipe','inherit']}),server=createInterface({input:child.stdout}),client=createInterface({input:process.stdin})
client.on('line',line=>{let x;try{x=JSON.parse(line)}catch{return}
 if(x.method==='tools/list')lists.add(x.id)
 if(x.method==='tools/call'){if(!permittedNativeContractCall(c,jobs,x.params?.name,x.params?.arguments)){trace({event:'refused',name:x.params?.name});return send({jsonrpc:'2.0',id:x.id,result:{isError:true,content:[{type:'text',text:'exact native metadata contract refused; no other desktop operations permitted'}]}})}calls.set(x.id,x.params.name);trace({event:'call',name:x.params.name})}
 if(x.method?.startsWith('resources/'))return send({jsonrpc:'2.0',id:x.id,error:{code:-32602,message:'native contract has no resource access'}})
 child.stdin.write(JSON.stringify(x)+'\n')
})
server.on('line',line=>{const x=JSON.parse(line)
 if(lists.delete(x.id)&&x.result?.tools){const status=x.result.tools.find(t=>t.name==='broker_service_status'),route=x.result.tools.find(t=>t.name==='broker_service_read_current'),config=x.result.tools.find(t=>t.name==='set_session_config'),nativeSteer=x.result.tools.find(t=>t.name==='steer_session'),nativeSend=x.result.tools.find(t=>t.name==='send_message');trace({event:'schema',independentSession:!!status?.inputSchema?.properties?.session,historical:!!status?.inputSchema?.properties?.historical,currentRoute:!!route?.inputSchema?.properties?.session_id,metadataConfig:!!config?.inputSchema?.properties?.metadata_controller,nativeSteer:!!nativeSteer?.inputSchema?.properties?.controller_session,nativeSend:!!nativeSend?.inputSchema?.properties?.controller_session});x.result.tools=x.result.tools.filter(t=>(c.reviewOnly?['driver_guide','driver_wait']:NATIVE_CONTRACT_TOOLS).includes(t.name))}
 if(calls.has(x.id)){const name=calls.get(x.id),out=x.result?.structuredContent;if(name==='driver_submit'&&!x.result?.isError&&/^j[a-f0-9]{32}$/.test(out?.jobId))jobs.add(out.jobId);trace({event:'reply',name,isError:!!(x.error||x.result?.isError),jobId:out?.jobId,state:out?.state,reused:out?.reused,...nativeContractReplyEvidence(out,{routeCurrent:c.routeCurrent===true,metadataConfig:c.metadataConfig===true,metadataModel:c.metadataModel===true,nativeSend:c.nativeSend===true,nativeSteer:c.nativeSteer===true})});calls.delete(x.id)}send(x)
})
client.on('close',()=>child.stdin.end());child.on('exit',code=>process.exit(code||0));for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>child.kill(signal))
