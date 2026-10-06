#!/usr/bin/env node
// Test-only filter around the actual MCP launcher. Arbitrary harness output
// cannot navigate, send, stop or otherwise act in the real desktop app.
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
const session=process.env.CLAUDE_DRIVER_FIXTURE_SESSION
if(!/^local_[0-9a-f-]{36}$/.test(session||''))throw new Error('fixture session required')
export const ALLOWED=['driver_guide','get_session','session_events','driver_submit','driver_job','driver_wait','driver_cancel','driver_memory_record','driver_memory_query']
const child=spawn(fileURLToPath(new URL('../bin/claude-driver-mcp',import.meta.url)),[],{env:process.env,stdio:['pipe','pipe','inherit']})
const server=createInterface({input:child.stdout}),client=createInterface({input:process.stdin})
const send=x=>process.stdout.write(JSON.stringify(x)+'\n')
const lists=new Set()
function permitted(name,args={}){
 if(!ALLOWED.includes(name))return false
 if(['get_session','session_events'].includes(name))return args.session===session
 if(name==='driver_submit')return ['get_session','session_events','session_wait'].includes(args.operation)&&args.arguments?.session===session
 if(name==='driver_memory_record')return args.topic==='cross-harness-fixture'
 return true
}
client.on('line',line=>{
 let x;try{x=JSON.parse(line)}catch{return child.stdin.write(line+'\n')}
 if(x.method==='tools/list')lists.add(x.id)
 if(x.method==='tools/call'&&!permitted(x.params?.name,x.params?.arguments))return send({jsonrpc:'2.0',id:x.id,result:{isError:true,content:[{type:'text',text:'fixture scope refused: native desktop controls are unavailable'}]}})
 if(x.method==='resources/read'&&!['claude-driver://guide','claude-driver://memory'].includes(x.params?.uri))return send({jsonrpc:'2.0',id:x.id,error:{code:-32602,message:'fixture resource refused'}})
 child.stdin.write(JSON.stringify(x)+'\n')
})
server.on('line',line=>{
 const x=JSON.parse(line)
 if(lists.delete(x.id)&&x.result?.tools)x.result.tools=x.result.tools.filter(t=>ALLOWED.includes(t.name))
 send(x)
})
client.on('close',()=>child.stdin.end())
child.on('exit',code=>process.exit(code||0))
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>child.kill(signal))
