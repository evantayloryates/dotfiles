// Public MCP relay for one isolated, human-authorized fixture. Preserves host
// metadata verbatim; it does not manufacture context or use private native RPCs.
import {spawn} from 'node:child_process'
import {createInterface} from 'node:readline'
import {appendFileSync,readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {homedir,hostname} from 'node:os'
import {join} from 'node:path'
import {audit} from './native-audit.mjs'
const workspace='/Users/theo/.local/state/claude-driver/input-teardown-20261018',run=process.argv[2]
if(homedir()!=='/Users/theo'||hostname().split('.')[0]!=='theo-air'||!run?.startsWith(workspace+'/host-context-20261018/run-')||run.includes('/../'))throw Error('native relay scope refused')
const owner=JSON.parse(readFileSync(join(workspace,'owner.json'),'utf8'))
if(owner.threadId!=='01a112b1-fbf6-7cb0-8228-ce3e6cb6112d')throw Error('native relay owner refused')
const intent=JSON.parse(readFileSync(join(run,'native-intent.json'),'utf8'))
const receiptPath=join(workspace,'evidence/acquire-1792351052633.request-1.response.json')
const receipt=JSON.parse(readFileSync(receiptPath,'utf8'))
const original=JSON.parse(readFileSync(receiptPath.replace('.response.json','.pending.json'),'utf8'))
const hash=x=>createHash('sha256').update(x).digest('hex')
const grant=p=>p.mode==='form'&&p.message==='Allow Computer Use to use "Claude Driver Input Fixture"?'&&p._meta?.connector_id==='computer-use'&&p._meta?.riskLevel==='low'&&['get_app_state','type_text'].includes(p._meta?.tool_name)&&JSON.stringify(p._meta?.tool_params)===JSON.stringify({app:'dev.taylor.claudedriver.inputfixture'})
if(receipt.source!=='Taylor via current Codex chat'||receipt.action!=='accept'||receipt.requestSha256!==hash(JSON.stringify(original.params))||!grant(original.params))throw Error('fixture human grant refused')
const runtime=join(workspace,'tools/cua_node')
const env={HOME:homedir(),USER:'theo',LOGNAME:'theo',TMPDIR:join(workspace,'tmp'),PATH:join(runtime,'bin')+':/usr/bin:/bin:/usr/sbin:/sbin',CODEX_HOME:join(workspace,'codex-home'),CODEX_CLI_PATH:join(workspace,'tools/CodexCLI.app/Contents/MacOS/codex'),CUA_REPL_NODE_REPL_PATH:join(runtime,'bin/node_repl'),CUA_REPL_ENABLED_SURFACES:'computer',NODE_REPL_NODE_MODULE_DIRS:join(runtime,'lib/node_modules'),NODE_REPL_TRUSTED_CODE_PATHS:join(runtime,'lib/node_modules'),NODE_PATH:join(runtime,'lib/node_modules')}
const child=spawn(join(runtime,'bin/node'),[join(runtime,'lib/node_modules/@oai/cua-repl/bin/cua-repl.mjs')],{cwd:workspace,env,stdio:['pipe','pipe','pipe']})
const calls=new Map()
const log=event=>appendFileSync(join(run,'native-events.jsonl'),JSON.stringify({at:new Date().toISOString(),...event})+'\n',{mode:0o600})
const out=value=>process.stdout.write(JSON.stringify(value)+'\n')
const send=value=>child.stdin.write(JSON.stringify(value)+'\n')
child.stderr.on('data',b=>process.stderr.write(b))
child.stdin.on('error',()=>{})
let typed=false,acquired=false,acquireCalls=0,stopCalls=0,context
createInterface({input:process.stdin}).on('line',line=>{
    let message;try{message=JSON.parse(line)}catch{return}
    if(message.method==='tools/call'){
        const p=message.params,a=p.arguments??{}
        let allowed=false
        if(p.name==='js'){
            const meta=p._meta?.['x-codex-turn-metadata']
            const valid=meta&&typeof meta==='object'&&typeof meta.thread_id==='string'&&meta.session_id===meta.thread_id&&typeof meta.turn_id==='string'
            const same=valid&&(!context||(context.thread_id===meta.thread_id&&context.turn_id===meta.turn_id))
            allowed=same&&((!acquired&&acquireCalls===0&&a.code===intent.acquireCode)||(acquired&&!typed&&a.code===intent.typeCode))
            if(allowed&&!context)context=meta
            if(allowed&&a.code===intent.acquireCode)acquireCalls++
            if(allowed&&a.code===intent.typeCode)typed=true
        }else if(p.name==='turn_ended')allowed=!!context&&a.hook_event_name==='Stop'&&a.session_id===context.session_id&&a.turn_id===context.turn_id&&stopCalls++===0
        if(!allowed){log({event:'refused',name:p.name});out({jsonrpc:'2.0',id:message.id,error:{code:-32601,message:'isolated fixture call scope refused'}});return}
        calls.set(message.id,{name:p.name,arguments:a,metadata:p._meta})
        log({event:'call',name:p.name,arguments:a,metadata:p._meta,snapshot:a.code===intent.typeCode||p.name==='turn_ended'?audit(workspace):undefined})
    }else if(!['initialize','notifications/initialized','notifications/cancelled','tools/list','ping'].includes(message.method)){
        if(message.id!==undefined)out({jsonrpc:'2.0',id:message.id,error:{code:-32601,message:'isolated fixture protocol scope refused'}})
        return
    }
    send(message)
})
createInterface({input:child.stdout}).on('line',line=>{
    let message;try{message=JSON.parse(line)}catch{return}
    if(message.method&&message.id!==undefined){
        if(message.method==='elicitation/create'&&grant(message.params)){
            log({event:'human-grant-relay',method:message.method,requestSha256:hash(JSON.stringify(message.params)),receiptPath})
            send({jsonrpc:'2.0',id:message.id,result:{action:'accept',content:{}}})
        }else{
            log({event:'approval-refused',method:message.method})
            send({jsonrpc:'2.0',id:message.id,error:{code:-32601,message:'only the explicit fixture app grant is authorized'}})
        }
        return
    }
    const call=calls.get(message.id)
    if(call){
        calls.delete(message.id)
        const text=message.result?.content?.filter(c=>c.type==='text').map(c=>c.text).join('\n')??''
        const expectedAx=text.includes('Claude Driver Input Teardown Fixture')&&text.includes('claude-driver-test-editor')
        if(call.name==='js'&&call.arguments.code===intent.acquireCode&&!message.error&&!message.result?.isError&&expectedAx)acquired=true
        log({event:'result',name:call.name,acquired,expectedAx,isError:!!(message.error||message.result?.isError),snapshot:audit(workspace)})
    }
    out(message)
})
process.stdin.on('end',()=>child.stdin.end())
child.on('close',(code,signal)=>{log({event:'mcp-exit',code,signal});process.exitCode=code??1})
