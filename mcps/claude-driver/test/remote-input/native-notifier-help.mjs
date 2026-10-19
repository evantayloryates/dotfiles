#!/usr/bin/env node
// Read the reviewed notifier's CLI help inside a deny-by-default sandbox.
// No notifier delivery, helper launch, app acquisition or input is permitted.
import {spawn,execFileSync} from 'node:child_process'
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {homedir,hostname} from 'node:os'
import {join} from 'node:path'

const root='/Users/theo/.local/state/claude-driver/input-teardown-20261018'
if(process.platform!=='darwin'||homedir()!=='/Users/theo'||hostname().split('.')[0]!=='theo-air'||!process.env.SSH_CONNECTION||JSON.parse(readFileSync(join(root,'owner.json'))).threadId!=='01a112b1-fbf6-7cb0-8228-ce3e6cb6112d')throw Error('remote owner/scope refused')
const app=join(root,'codex-home/computer-use/Codex Computer Use.app')
const client=join(app,'Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient')
const sha=value=>createHash('sha256').update(value).digest('hex')
if(sha(readFileSync(client))!=='4861d29eb73f6f71a5a82dc94fc7c696d34e8cd6493f1932f6ba7b51f6448cf5')throw Error('reviewed notifier changed')
const processes=()=>execFileSync('/bin/ps',['-axo','pid=,ppid=,pgid=,comm='],{encoding:'utf8',timeout:5000}).split('\n').filter(x=>/SkyComputerUse(Service|Client)/.test(x)).map(x=>x.trim())
const before=processes()
if(before.length)throw Error('native service/client present; help fixture requires an empty native baseline')
const run=mkdtempSync(join(root,'evidence/notifier-help-'))
mkdirSync(join(run,'home'),{mode:0o700})
const profile=`(version 1)
(deny default)
(allow file-read-metadata)
(allow file-read-data (subpath "/System") (subpath "/usr/lib") (subpath "/Library/Apple") (subpath "/private/var/db/dyld") (subpath ${JSON.stringify(app)}))
(allow sysctl-read)
(allow process-exec (literal ${JSON.stringify(client)}))
`
writeFileSync(join(run,'sandbox.sb'),profile,{flag:'wx',mode:0o600})
writeFileSync(join(run,'source.mjs'),readFileSync(new URL(import.meta.url)),{flag:'wx',mode:0o600})
const report={run,startedAt:new Date().toISOString(),scope:'native-notifier-cli-help-only-deny-mach-network-write-fork',sourceSha256:sha(readFileSync(new URL(import.meta.url))),clientSha256:sha(readFileSync(client)),sandboxSha256:sha(profile),nativeBefore:before,helperLaunchRequested:false,inputRequested:false,notificationRequested:false,commands:[]}
try{
 for(const args of [['--help'],['turn-ended','--help']]){
  const child=spawn('/usr/bin/sandbox-exec',['-f',join(run,'sandbox.sb'),client,...args],{cwd:run,env:{HOME:homedir(),USER:'theo',LOGNAME:'theo',PATH:'/usr/bin:/bin:/usr/sbin:/sbin',CODEX_HOME:join(run,'home'),TMPDIR:join(root,'tmp')},detached:true,stdio:['ignore','pipe','pipe']})
  let stdout='',stderr='',truncated=false
  const collect=(key,b)=>{if(key==='stdout'){stdout+=b;if(stdout.length>65536){stdout=stdout.slice(0,65536);truncated=true}}else{stderr+=b;if(stderr.length>65536){stderr=stderr.slice(0,65536);truncated=true}}}
  child.stdout.on('data',b=>collect('stdout',b));child.stderr.on('data',b=>collect('stderr',b))
  let timedOut=false
  const timer=setTimeout(()=>{timedOut=true;try{process.kill(-child.pid,'SIGKILL')}catch{}},8000)
  const exit=await new Promise(resolve=>{child.on('error',e=>resolve({error:e.message}));child.on('close',(code,signal)=>resolve({code,signal}))});clearTimeout(timer)
  report.commands.push({args,pid:child.pid,exit,timedOut,truncated,stdout,stderr})
  if(exit.code!==0||timedOut||truncated)throw Error('sandboxed help command failed; do not loosen sandbox automatically')
 }
 report.nativeAfter=processes()
 report.ok=report.commands.every(x=>x.exit.code===0&&/USAGE:/.test(x.stdout))&&report.nativeAfter.length===0
}catch(e){report.error=e.message;report.ok=false;report.nativeAfter=processes()}
finally{report.finishedAt=new Date().toISOString();writeFileSync(join(run,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600})}
console.log(JSON.stringify(report))
if(!report.ok)process.exitCode=1
