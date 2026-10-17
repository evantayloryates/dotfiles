// Builds one standalone receiver entry; does not install or activate it.
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {join,resolve} from 'node:path'
const main=String.raw`
import {spawnSync as runReceiverHandler} from 'node:child_process'
import {pathToFileURL as receiverFileUrl,fileURLToPath as receiverUrlPath} from 'node:url'
import {realpathSync as receiverRealPath} from 'node:fs'
async function receiverHookMain(){
 const chunks=[];let size=0
 for(;;){const chunk=Buffer.alloc(8192),n=readSync(0,chunk,0,chunk.length,null);if(!n)break;size+=n;if(size>65536)throw Error('hook input too large');chunks.push(chunk.subarray(0,n))}
 const bytes=Buffer.concat(chunks),input=JSON.parse(bytes)
 if(input?.hook_event_name!=='PreToolUse'||typeof input.cwd!=='string')throw Error('hook identity')
 const selected=loadReceiverSelection(input.cwd)
 if(process.argv.length!==2||process.argv[1]!==join(input.cwd,'.claude-driver-services','receiver-stop-entry.mjs'))throw Error('entry path')
 const bootstrap=await import(receiverFileUrl(selected.bootstrap).href)
 if(typeof bootstrap.admitPinnedReceiverHook!=='function')throw Error('bootstrap capability')
 const admitted=bootstrap.admitPinnedReceiverHook({dir:selected.brokerDir,expectedPointer:selected.pointer,input})
 if(admitted.script!==selected.handler||admitted.state!==selected.stateDir||!admitted.nativeBinding?.ancestorVerified)throw Error('entry admission')
 const latest=loadReceiverSelection(input.cwd)
 if(JSON.stringify(latest)!==JSON.stringify(selected))throw Error('selection changed')
 const result=runReceiverHandler(process.execPath,[receiverRealPath(selected.handler),selected.brokerDir,'PreToolUse'],{input:bytes,encoding:'utf8',timeout:4000,maxBuffer:65536,env:{...process.env,CLAUDE_DRIVER_STATE_DIR:selected.stateDir}})
 if(result.error||result.signal||result.status!==0)throw Error('handler failed')
 const output=JSON.parse(result.stdout),specific=output?.hookSpecificOutput
 if(specific?.hookEventName!=='PreToolUse'||specific.permissionDecision!==undefined&&specific.permissionDecision!=='deny')throw Error('handler output')
 process.stdout.write(JSON.stringify(output)+'\n')
}
if(process.argv[1]&&receiverRealPath(process.argv[1])===receiverUrlPath(import.meta.url)){
 await receiverHookMain().catch(()=>process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'deny',permissionDecisionReason:'Receiver runtime entry failed bound selection or sealed native admission. No handler result is authorized.'}})+'\n'))
}
`
export function buildReceiverHookArtifact(receiverCwd){
 if(typeof receiverCwd!=='string'||receiverCwd==='/'||resolve(receiverCwd)!==receiverCwd)throw Error('receiver artifact cwd refused')
 const source=readFileSync(new URL('./receiver-runtime-selection.mjs',import.meta.url),'utf8')+'\n'+main
 const anchorPath=join(receiverCwd,'.claude-driver-services','receiver-stop-entry.mjs')
 const settingsBytes=JSON.stringify({hooks:{PreToolUse:[{matcher:'Bash|mcp__ccd_.*',hooks:[{type:'command',command:process.execPath,args:[anchorPath],timeout:5}]}]}},null,2)+'\n'
 const hash=s=>createHash('sha256').update(s).digest('hex')
 return {anchorPath,source,anchorSha256:hash(source),settingsPath:join(receiverCwd,'.claude','settings.json'),settingsBytes,settingsSha256:hash(settingsBytes)}
}
