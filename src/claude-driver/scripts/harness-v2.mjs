#!/usr/bin/env node
// Actual headless harnesses exercise the service against private synthetic
// stores, behind a filter that prohibits every native desktop control.
import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cleanEnv, resolveClaudeBinary } from '../lib/paths.mjs'
import { PROBE_DIR, STATE_DIR, readJson, writeJsonAtomic } from '../lib/state.mjs'
import { recordMemory } from '../lib/memory.mjs'
import { RUNTIME_BUILD, runtimeFingerprint } from '../lib/build.mjs'
import { FIXTURE_TOOLS } from './fixture-contract.mjs'
const flag=(name,defaultValue)=>{const i=process.argv.indexOf('--'+name);return i<0?defaultValue:process.argv[i+1]}
const harness=flag('harness','claude')
if(!['claude','codex','cursor'].includes(harness))throw new Error('--harness must be claude, codex or cursor')
const codexModel=flag('codex-model',null)
if(harness==='codex'&&!codexModel)throw new Error('pass --codex-model with the configured model; no model substitution')
const configFiles=[join(homedir(),'.cursor','mcp.json'),join(homedir(),'.codex','config.toml'),join(homedir(),'.claude','settings.json')]
const configHashes=()=>Object.fromEntries(configFiles.map(p=>[p,existsSync(p)?createHash('sha256').update(readFileSync(p)).digest('hex'):null]))
const originalConfigs=configHashes()
const stamp=new Date().toISOString().replace(/[:.]/g,'-')
const root=join(PROBE_DIR,`harness-v2-${harness}-${stamp}`)
const localState=join(root,'state'),app=join(root,'app'),peers=join(root,'peers'),projects=join(root,'projects')
for(const dir of [root,localState,peers,projects,join(app,'claude-code-sessions','fixture','fixture')])mkdirSync(dir,{recursive:true,mode:0o700})
const sid=`local_${randomUUID()}`,cli=sid.slice(6),title='PRIVATE_HARNESS_FIXTURE'
writeJsonAtomic(join(app,'claude-code-sessions','fixture','fixture',`${sid}.json`),{sessionId:sid,cliSessionId:cli,title,cwd:root,isArchived:false})
const transcript=join(projects,root.replace(/[^A-Za-z0-9]/g,'-'),`${cli}.jsonl`)
mkdirSync(join(transcript,'..'),{recursive:true,mode:0o700});writeFileSync(transcript,'',{mode:0o600})
const proxy=fileURLToPath(new URL('./fixture-mcp.mjs',import.meta.url))
const allowed=FIXTURE_TOOLS
const traceFile=join(root,'mcp-trace.jsonl')
const isolated={CLAUDE_DRIVER_STATE_DIR:localState,CLAUDE_DRIVER_APP_SUPPORT:app,CLAUDE_DRIVER_PROJECTS_DIR:projects,CLAUDE_DRIVER_PEER_SESSIONS_DIR:peers,CLAUDE_DRIVER_FIXTURE_SESSION:sid,CLAUDE_DRIVER_FIXTURE_TRACE:traceFile,CLAUDE_DRIVER_CALLER_SESSION:'',CLAUDE_CODE_ENTRYPOINT:''}
const mcp={mcpServers:{bridge:{command:process.execPath,args:[proxy],env:isolated}}}
const mcpConfig=join(root,'mcp.json');writeJsonAtomic(mcpConfig,mcp)
const prompt=`This is an isolated MCP contract qualification, not a coding task. Use only bridge MCP tools. Do not run shell, browse, inspect files or invoke native desktop controls. 1. Call driver_guide. 2. Call get_session with session ${sid}; verify title PRIVATE_HARNESS_FIXTURE. 3. Call driver_submit with operation get_session, arguments {session:"${sid}"}, idempotency_key "harness-fixture". 4. Repeat that identical submission once; verify same jobId and reused:true. 5. Call driver_wait for that job_id, timeout_sec:30; verify completed and result.sessionId ${sid}. 6. Call session_events for ${sid}; verify no old events and a cursor. 7. Call driver_memory_record topic cross-harness-fixture, lesson "Synthetic harness contract checked", evidence "${harness} headless fixture". 8. Query driver_memory_query topic cross-harness-fixture and verify that candidate exists. Finish with exactly HARNESS_V2_OK only if all checks succeeded; otherwise HARNESS_V2_FAILED with the failed check. Do not invent observations. The stores contain synthetic data only.`
let command,args,env=cleanEnv(isolated)
if(harness==='claude'){
 command=resolveClaudeBinary()
 args=['-p',prompt,'--model','claude-haiku-4-5-20251001','--restricted','--setting-sources','','--strict-mcp-config','--mcp-config',mcpConfig,'--tools','','--allowedTools',allowed.map(n=>`mcp__bridge__${n}`).join(','),'--permission-mode','dontAsk','--no-session-persistence','--output-format','stream-json','--verbose','--max-turns','12']
}else if(harness==='codex'){
 command=join(homedir(),'.local','bin','codex')
 const toml=v=>JSON.stringify(v)
 const server=`{command=${toml(process.execPath)},args=${toml([proxy])},env={${Object.entries(isolated).map(([k,v])=>`${k}=${toml(v)}`).join(',')}},enabled=true,required=true,default_tools_approval_mode="approve",enabled_tools=${toml(allowed)}}`
 args=['--no-daemon','-a','never','exec','--ignore-user-config','--ephemeral','--skip-git-repo-check','--sandbox','read-only','--json','--model',codexModel,'-c',`mcp_servers.bridge=${server}`,'-c','features.apps=false',prompt]
}else{
 command=join(homedir(),'.local','bin','cursor-agent')
 mkdirSync(join(root,'.cursor'),{recursive:true,mode:0o700});writeJsonAtomic(join(root,'.cursor','mcp.json'),mcp)
 // Cursor merges user/project MCP definitions. Disable every user server
 // through its documented command in this fixture's project only.
 const global=readJson(join(homedir(),'.cursor','mcp.json'),{mcpServers:{}})
 for(const name of Object.keys(global.mcpServers||{})){
  const r=spawnSync(command,['mcp','disable',name],{cwd:root,env,encoding:'utf8',timeout:10000})
  if(r.status!==0)throw new Error('could not isolate Cursor MCP servers; fixture refused')
 }
 args=['--print','--mode','ask','--approve-mcps','--output-format','stream-json','--workspace',root,prompt]
}
const raw=join(root,'harness-output.jsonl'),errors=join(root,'harness-stderr.log')
let output='',stderr='',timedOut=false
let spawnError
const at=Date.now(),child=spawn(command,args,{cwd:root,env,stdio:['ignore','pipe','pipe'],detached:true})
const stop=()=>{try{process.kill(-child.pid,'SIGTERM')}catch{}}
const timer=setTimeout(()=>{timedOut=true;stop()},150000)
const hard=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL')}catch{}},155000)
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,stop)
child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>stderr+=x)
const code=await new Promise(resolve=>{child.once('exit',resolve);child.once('error',error=>{spawnError=error.code;resolve(-1)})})
clearTimeout(timer);clearTimeout(hard)
writeFileSync(raw,output,{mode:0o600});writeFileSync(errors,stderr,{mode:0o600})
const rows=(()=>{try{return readFileSync(join(localState,'ledger.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(x=>JSON.parse(x))}catch{return[]}})()
const jobs=existsSync(join(localState,'jobs'))?readdirSync(join(localState,'jobs'),{withFileTypes:true}).filter(x=>x.isFile()&&x.name.endsWith('.json')).map(x=>readJson(join(localState,'jobs',x.name),{})):[]
for(const j of jobs)if(['running','queued'].includes(j.state))spawnSync(process.execPath,[fileURLToPath(new URL('../cli.mjs',import.meta.url)),'driver_cancel','--job-id',j.id],{env,cwd:root,stdio:'ignore',timeout:10000})
const memory=(()=>{try{return readFileSync(join(localState,'memory.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(x=>JSON.parse(x))}catch{return[]}})()
const calls=rows.filter(x=>x.op==='driver_submit')
const events=output.split('\n').flatMap(line=>{try{return[JSON.parse(line)]}catch{return[]}})
const finals=events.filter(x=>x.type==='result'||(x.type==='item.completed'&&x.item?.type==='agent_message'))
const final=finals.at(-1)
const finalText=final?.result??final?.item?.text??''
const trace=existsSync(traceFile)?readFileSync(traceFile,'utf8').trim().split('\n').filter(Boolean).map(x=>JSON.parse(x)):[]
const required=['driver_guide','get_session','driver_submit','driver_wait','session_events','driver_memory_record','driver_memory_query']
const checks={processSucceeded:code===0&&!timedOut,finalMarker:typeof finalText==='string'&&finalText.includes('HARNESS_V2_OK'),successfulToolReplies:required.every(name=>trace.some(x=>x.event==='reply'&&x.name===name&&!x.isError)),twoSubmissions:calls.length===2,oneWorker:jobs.length===1,completed:jobs[0]?.state==='completed',recipient:jobs[0]?.result?.sessionId===sid&&jobs[0]?.result?.title===title,sharedCandidate:memory.some(x=>x.topic==='cross-harness-fixture'&&x.status==='candidate'),sourceUnchanged:runtimeFingerprint()===RUNTIME_BUILD,globalConfigUnchanged:JSON.stringify(configHashes())===JSON.stringify(originalConfigs)}
const report=join(STATE_DIR,'pressure',`harness-v2-${harness}-${stamp}.json`)
const version=spawnSync(command,['--version'],{env,encoding:'utf8',timeout:10000}).stdout?.trim()
const ok=Object.values(checks).every(Boolean)
const rateLimited=events.some(x=>x.type==='rate_limit_event'&&x.rate_limit_info?.status==='rejected')
const failureCategory=ok?null:spawnError?'harness_unavailable':rateLimited?'harness_rate_limited':/authentication required|not logged in/i.test(stderr)?'harness_auth_required':timedOut?'harness_timeout':'harness_contract_failed'
writeJsonAtomic(report,{harness,version,model:harness==='codex'?codexModel:harness==='claude'?'claude-haiku-4-5-20251001':'configured-default',runtimeBuild:RUNTIME_BUILD,root,raw,errors,traceFile,checks,code,timedOut,failureCategory,ms:Date.now()-at,ok})
recordMemory({kind:'test_result',topic:'v2-harness-contract',source:`${harness}-headless`,status:ok?'passed':'failed',evidence:report,lesson:`Actual headless harness on synthetic stores: ${JSON.stringify(checks)}`})
console.log(JSON.stringify({harness,report,ok,failureCategory,checks,ms:Date.now()-at}))
process.exitCode=ok?0:1
