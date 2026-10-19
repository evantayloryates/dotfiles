// Remote-only non-UI boundary: actual owner/worker/kernel + synthetic socket
// backend and actual Git hash-object reading an empty private FIFO. No network.
import {spawn,execFileSync} from 'node:child_process'
import {mkdirSync,writeFileSync,readFileSync,openSync,closeSync,existsSync} from 'node:fs'
import {homedir,hostname} from 'node:os'
import {join} from 'node:path'
const root='/Users/theo/.local/state/claude-driver/input-teardown-20261018',mode=process.argv[2]
if(hostname().split('.')[0]!=='theo-air'||homedir()!=='/Users/theo'||!process.env.SSH_CONNECTION||JSON.parse(readFileSync(join(root,'owner.json'))).threadId!=='01a112b1-fbf6-7cb0-8228-ce3e6cb6112d'||!['cooperative','escalated'].includes(mode))throw Error('remote ancillary scope refused')
const run=join(root,'evidence','owner-ancillary-'+Date.now()),state=join(run,'state'),dir=join(run,'lease'),helper=join(run,'helper'),backend=join(run,'backend'),fifo=join(run,'empty.pipe'),entry=join(run,'owner.mjs'),git='/opt/homebrew/bin/git'
for(const p of [run,state,dir])mkdirSync(p,{recursive:true,mode:0o700})
if(!existsSync(git))throw Error('reviewed remote Git unavailable')
process.env.CLAUDE_DRIVER_STATE_DIR=state;process.env.CODEX_HOME=run;process.env.CODEX_BRIDGE_CODEX_PATH=backend
writeFileSync(join(state,'ui-quarantine.json'),JSON.stringify({blocked:false,scope:'synthetic ancillary process test; no CUA'}))
const moduleUrl=name=>new URL('../../src/lib/'+name,import.meta.url).href
const {withLock}=await import('../../src/lib/state.mjs'),{runOwnedUiLease,ownedGroupMembers}=await import('../../src/lib/ui-lease-owner.mjs')
execFileSync('/usr/bin/mkfifo',[fifo]);const writer=openSync(fifo,'r+')
writeFileSync(helper,`#!${process.execPath}\nimport{createServer}from'node:net';const s=createServer(c=>c.on('end',()=>s.close(()=>process.exit(0))));s.listen(process.env.SKY_CUA_SERVICE_NATIVE_PIPE_PATH);`,{mode:0o700})
const roster={data:[{name:'cua_repl',pluginId:null,runtimeStatus:'connected',tools:{js:{},js_reset:{},turn_ended:{}},authStatus:'unsupported',resources:[],resourceTemplates:[]}],nextCursor:null}
writeFileSync(backend,`#!${process.execPath}
import{createInterface}from'node:readline';import{connect}from'node:net';import{spawn}from'node:child_process';import{openSync,closeSync}from'node:fs';
if(process.argv.includes('--version')){console.log('codex-cli 0.160.0-synthetic');process.exit(0)}
const emit=x=>console.log(JSON.stringify(x));let client;
createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);if(r.id===undefined)return;
if(r.method==='thread/start'){client=connect(r.params.config.mcp_servers.cua_repl.env.SKY_CUA_SERVICE_NATIVE_PIPE_PATH);client.on('connect',()=>emit({id:r.id,result:{thread:{id:'owned-thread'},model:'synthetic'}}));return}
emit({id:r.id,result:r.method==='mcpServerStatus/list'?${JSON.stringify(roster)}:r.method==='turn/start'?{turn:{id:'owned-turn'}}:{}});
if(r.method==='turn/start'){
 const fd=openSync(${JSON.stringify(fifo)},'r'),ignoredTerm='import os,signal;signal.signal(signal.SIGTERM,signal.SIG_IGN);os.execv('+${JSON.stringify(JSON.stringify(git))}+', ['+${JSON.stringify(JSON.stringify(git))}+',"hash-object","--stdin"])';
 const child=${JSON.stringify(mode)}==='escalated'?spawn('/usr/bin/python3',['-I','-c',ignoredTerm],{stdio:[fd,'ignore','ignore']}):spawn(${JSON.stringify(git)},['hash-object','--stdin'],{stdio:[fd,'ignore','ignore']});closeSync(fd);
 child.once('spawn',()=>setTimeout(()=>{emit({method:'item/completed',params:{threadId:'owned-thread',item:{type:'agentMessage',text:'ANCILLARY_OK'}}});emit({method:'turn/completed',params:{threadId:'owned-thread',turn:{id:'owned-turn',status:'completed'}}})},250));
}});
`,{mode:0o700})
const runtime={resourceRoot:run,helperApp:run,codexHome:run,hashes:{scope:'synthetic'},files:{helper,node:process.execPath,launcher:join(run,'unused-cua.mjs'),cli:backend}}
writeFileSync(entry,`import{serveUiLeaseOwner}from${JSON.stringify(moduleUrl('ui-lease-owner.mjs'))};import{openPrivateInputService}from${JSON.stringify(moduleUrl('private-input-service.mjs'))};import{writeFileSync}from'node:fs';await serveUiLeaseOwner({openService:options=>openPrivateInputService(options,{inspect:async()=>(${JSON.stringify(runtime)})}),audit:async options=>writeFileSync(options.evidence,JSON.stringify({scope:'synthetic no-CUA audit',filters:[]}))});`)
const sentinel=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'})
const report={run,mode,scope:'synthetic-owner-real-git-no-network',nativeComputerUse:false,modelCalls:0}
try{
 await withLock('ui-automation',async lockFd=>{
  try{report.value=await runOwnedUiLease({payload:{task:'synthetic ancillary fixture',timeoutSec:30},dir,lockFd},{ownerScript:entry});report.accepted=true}
  catch(e){report.accepted=false;report.error={category:e.category,message:e.message}}
 },{passKernelLock:true})
 report.owner=JSON.parse(readFileSync(join(dir,'ui-owner.json')))
 report.remaining=await ownedGroupMembers(report.owner.ownerPid)
 report.sentinelAlive=sentinel.exitCode===null&&sentinel.signalCode===null
 report.ok=report.remaining.length===0&&report.sentinelAlive&&(mode==='cooperative'?report.accepted&&report.owner.ancillaryGitRetired===true&&!report.owner.groupCleanup.escalated:!report.accepted&&report.owner.groupCleanup.escalated===true)
}finally{
 closeSync(writer);sentinel.kill('SIGTERM')
 writeFileSync(join(run,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600})
 console.log(JSON.stringify({run,mode,ok:report.ok,accepted:report.accepted,error:report.error,cleanup:report.owner?.groupCleanup,helper:report.owner?.nativeInputService,sentinelAlive:report.sentinelAlive}))
}
process.exitCode=report.ok?0:1
