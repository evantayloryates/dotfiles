// Harmless MCP fixture: records host lifecycle metadata, never controls UI.
import {createInterface} from 'node:readline'
import {appendFileSync,readFileSync} from 'node:fs'
import {join} from 'node:path'
import {homedir,hostname} from 'node:os'

const run=process.argv[2]
const workspace='/Users/theo/.local/state/claude-driver/input-teardown-20261018'
if(homedir()!=='/Users/theo'||hostname().split('.')[0]!=='theo-air'||
   !run?.startsWith(workspace+'/host-context-20261018/run-')||run.includes('/../'))throw Error('observer scope refused')
const owner=JSON.parse(readFileSync(join(workspace,'owner.json'),'utf8'))
if(owner.threadId!=='01a112b1-fbf6-7cb0-8228-ce3e6cb6112d')throw Error('observer owner refused')
const schema={type:'object',properties:{hook_event_name:{type:'string'},session_id:{type:'string'},turn_id:{type:'string'}},required:['hook_event_name','session_id','turn_id'],additionalProperties:false}
const send=(id,result)=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,result})+'\n')
for await(const line of createInterface({input:process.stdin})){
    let request
    try{request=JSON.parse(line)}catch{continue}
    if(request.id===undefined)continue
    if(request.method==='initialize')send(request.id,{protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'isolated-hook-observer',version:'1'}})
    else if(request.method==='tools/list')send(request.id,{tools:[{name:'turn_ended',description:'Record a lifecycle event in the owned test fixture.',inputSchema:schema,annotations:{readOnlyHint:true}}]})
    else if(request.method==='tools/call'&&request.params?.name==='turn_ended'){
        const event=request.params.arguments
        if(event?.hook_event_name!=='Stop'||typeof event.session_id!=='string'||typeof event.turn_id!=='string'){
            send(request.id,{isError:true,content:[{type:'text',text:'unexpected lifecycle fixture event'}]})
            continue
        }
        appendFileSync(join(run,'hook-events.jsonl'),JSON.stringify({at:new Date().toISOString(),...event})+'\n',{mode:0o600})
        send(request.id,{content:[{type:'text',text:'{"continue":true}'}]})
    }else process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,error:{code:-32601,message:'observer method unavailable'}})+'\n')
}
