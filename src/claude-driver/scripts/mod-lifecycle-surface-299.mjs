#!/usr/bin/env node
import {join} from 'node:path'
import {homedir} from 'node:os'
import {createHash} from 'node:crypto'
import {readReceiverFile,loadReceiverSelection} from '../lib/receiver-runtime-selection.mjs'
import {inspectNativeLifecycleSurface} from '../lib/native-lifecycle-surface.mjs'
import {getRecord} from '../lib/sessions.mjs'
import {runOp} from '../lib/driver.mjs'
import {versions} from '../lib/paths.mjs'
import {STATE_DIR,writeJsonAtomic} from '../lib/state.mjs'
import {RUNTIME_BUILD} from '../lib/build.mjs'
import {recordMemory} from '../lib/memory.mjs'
const i=process.argv.indexOf('--session'),session=process.argv[i+1]
if(i<0||!/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(session||''))throw Error('exact owned receiver required')
const report=join(STATE_DIR,'pressure','mod-lifecycle-surface-299-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json'),evidence={scope:'generated-2.1.299-lifecycle-declarations',runtimeBuild:RUNTIME_BUILD,nativeCalls:0,physicalExitQualified:false,recoveryQualified:false};let failure
try{
 if(versions().cli!=='2.1.299')throw Error('unreviewed native version')
 const record=getRecord(session),selected=loadReceiverSelection(record.cwd),status=await runOp('broker_service_status',{session,service_id:selected.selector.serviceId})
 if(!status.verified||status.nativeEpoch.status!=='idle'||record.permissionMode!=='bypassPermissions')throw Error('receiver unqualified')
 const root=join(process.env.CLAUDE_CONFIG_DIR||join(homedir(),'.claude'),'dev-mods',session.slice(6),'desktop-bridge-native-peer-service','.claude-plugin','types'),sources={}
 evidence.sources=sources
 const read=name=>{const file=join(root,name,'index.d.ts'),bytes=readReceiverFile(file,1048576);sources[name]={file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};return bytes.toString('utf8')}
 evidence.surface=inspectNativeLifecycleSurface(read('claude-code'),read('claude-code-mcp'));evidence.nativeEpoch=status.nativeEpoch
 if(JSON.stringify(loadReceiverSelection(record.cwd))!==JSON.stringify(selected)||versions().cli!=='2.1.299')throw Error('lifecycle declaration context changed while reading')
 evidence.limitations=['Generated declarations describe supported surface, not executed implementation','No archive/delete/stop/unarchive, process signal, app restart, consent or auth change','Archive side-session/worktree scope must be independently inventoried before any test','Missing direct exit declaration does not prove no other native lifecycle mechanism exists']
}catch(error){failure=String(error.message).slice(0,300)}
evidence.ok=!failure;if(failure)evidence.failure=failure
writeJsonAtomic(report,evidence);recordMemory({kind:'test_result',topic:'native-lifecycle-declaration-surface',source:'generated-owned-module-types',status:evidence.ok?'passed':'failed',evidence:report,lesson:'Current declaration surface distinguishes turn stop from archive process termination; archive may affect side sessions/worktree, deletion always has a human card. No direct session exit declared. Declaration-only evidence never qualifies physical exit or recovery.'});console.log(JSON.stringify({report,...evidence}));process.exitCode=evidence.ok?0:1
