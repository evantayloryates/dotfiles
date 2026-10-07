#!/usr/bin/env node
// One explicit, owned native experiment; never a scheduler or automatic wake.
import {existsSync,mkdirSync,readFileSync,writeFileSync,unlinkSync,lstatSync} from 'node:fs'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {brokerInfo,newRequestId} from '../lib/broker.mjs'
import {stageRelease,validateRelease} from '../lib/releases.mjs'
import {STATE_DIR,BROKER_DIR,loadRegistry,readJson,writeJsonAtomic} from '../lib/state.mjs'
import {getRecord} from '../lib/sessions.mjs'
import {enqueue,cancelRequest,control,nativeResultFile,inspectRequest} from '../lib/requests.mjs'
import {observeNativeReceipts} from '../lib/native-receipts.mjs'
import {deliver} from '../lib/peer-direct.mjs'
import {sleep} from '../lib/paths.mjs'
import {RUNTIME_BUILD} from '../lib/build.mjs'
import {recordMemory} from '../lib/memory.mjs'
if(process.argv[2]!=='--run-owned-probe')throw Error('explicit --run-owned-probe required')
const sid='local_35b3ba48-f02e-48de-bfbb-925192d90de1',fixture='local_fc1e5eab-9d24-4e4c-a09c-9a386a6ffe14'
const fixtureCwd=join(STATE_DIR,'probe','v2-2026-10-07T04-37-49-840Z')
const config=join(BROKER_DIR,'.claude','settings.json'),armFile=join(BROKER_DIR,'stop-rescue-arm.json')
const report=join(STATE_DIR,'pressure','native-stop-rescue-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json')
const outcome={scope:'one-armed-native-Stop-rescue',runtimeBuild:RUNTIME_BUILD,brokerSessionId:sid,fixture,claudeSenderTurns:0,maximumRescues:1,ok:false}
let id,installedSettings,wake
try{
 const before=brokerInfo(),owned=loadRegistry().sessions[fixture],rec=getRecord(fixture)
 if(before.sessionId!==sid||before.handoffStopped||!before.runtime?.integrity||before.live?.pid!==71262||before.live.procStart!=='Wed Oct  7 03:24:51 2026'||before.live.status!=='idle'||before.resident?.resident||before.permissionMode!=='bypassPermissions')throw Error('exact idle broker admission refused')
 if(!owned||owned.kind!=='create'||owned.cwd!==fixtureCwd||rec?.cwd!==fixtureCwd||rec.isArchived)throw Error('owned outstanding fixture admission refused')
 for(const req of ['rmuxmikjs-994346','rmuxmjx67-3a93fa','rmuxmyift-8e9115','rmuxn2qt8-bd1e31','rmuxo5m6t-cae19c']){const c=control(req);if(!['cancelled','expired'].includes(c.state)||c.dispatched?.length)throw Error('previous cleanup outcome requires reconciliation')}
 if(existsSync(config)||existsSync(armFile))throw Error('existing project settings or rescue arm requires review')
 const candidate=await stageRelease();validateRelease(candidate.build)
 const script=join(candidate.root,'scripts','broker-stop-rescue.mjs')
 outcome.hookBuild=candidate.build;outcome.hookSha256=createHash('sha256').update(readFileSync(script)).digest('hex');outcome.activeBrokerBuild=before.runtime.build
 id=newRequestId();outcome.requestId=id
 const request={id,ops:[{op:'archive_session',args:{session_id:fixture}}],createdAt:new Date().toISOString(),expiresAt:Date.now()+60000,protocol:7}
 const observe=observeNativeReceipts(sid,request);if(!observe)throw Error('native receipt unavailable');request.nativeObservation=observe.start
 enqueue(request)
 mkdirSync(join(BROKER_DIR,'.claude'),{recursive:true,mode:0o700})
 // Exclusive creation; cleanup removes only bytes installed by this probe.
 installedSettings=JSON.stringify({hooks:{Stop:[{hooks:[{type:'command',command:process.execPath,args:[script,BROKER_DIR],timeout:5}]}]}},null,2)
 writeFileSync(config,installedSettings,{mode:0o600,flag:'wx'})
 await sleep(1500) // allow configuration watcher to see the new project file
 wake=await deliver(before,'claude-driver wake v6',{timeoutMs:5000});observe.watchWake(wake.msgId)
 outcome.wake={msgId:wake.msgId,pid:wake.pid,procStart:wake.procStart}
 writeJsonAtomic(armFile,{schemaVersion:1,sessionId:sid,brokerDir:BROKER_DIR,pid:wake.pid,procStart:wake.procStart,msgId:wake.msgId,requestId:id,expiresAt:request.expiresAt})
 while(Date.now()<request.expiresAt){const actual=observe();if(actual){writeJsonAtomic(nativeResultFile(id),actual);outcome.nativeReceiptVerified=true;outcome.nativeToolResults=actual.results.map(r=>({op:r.op,ok:r.ok,nativeToolUseId:r.nativeToolUseId}));break}await sleep(250)}
 outcome.rescue=readJson(join(BROKER_DIR,'stop-rescue-'+id+'.json'),null)
 outcome.hookInvocation=readJson(join(BROKER_DIR,'stop-rescue-hook-invocation-'+id+'.json'),null)
 outcome.nativeWake=observe.wakeStatus(wake.msgId)
 const after=getRecord(fixture);outcome.fixtureArchived=after?.isArchived===true;outcome.fixtureCwdMatches=after?.cwd===fixtureCwd
 outcome.ok=!!outcome.nativeReceiptVerified&&outcome.nativeToolResults.every(r=>r.ok)&&outcome.fixtureArchived&&outcome.fixtureCwdMatches&&outcome.rescue?.attempts===1
 if(!outcome.ok)outcome.failure='bounded one-wake rescue did not establish native checkpointed cleanup'
}catch(error){outcome.failure=String(error.message).slice(0,300)}finally{
 if(id){try{outcome.settlement=await cancelRequest(id,outcome.nativeReceiptVerified?'cancelled':'expired');outcome.request=inspectRequest(id)}catch{outcome.settlementUnknown=true}}
 if(installedSettings&&existsSync(config)){const st=lstatSync(config);if(st.isFile()&&!st.isSymbolicLink()&&readFileSync(config,'utf8')===installedSettings){unlinkSync(config);outcome.experimentalSettingsRemoved=true}else outcome.settingsCleanupNeedsReview=true}
 const arm=readJson(armFile,null);if(id&&arm?.requestId===id&&arm.msgId===wake?.msgId){unlinkSync(armFile);outcome.disarmed=true}
 const after=brokerInfo();outcome.after={pid:after.live?.pid,procStart:after.live?.procStart,status:after.live?.status,resident:after.resident?.resident,activeBrokerBuild:after.runtime?.build,integrity:after.runtime?.integrity,handoffStopped:after.handoffStopped}
 writeJsonAtomic(report,outcome);recordMemory({kind:'test_result',topic:'one-shot-stop-rescue',source:'owned-native-experiment',status:outcome.ok?'passed':'failed',evidence:report,lesson:'One bounded command Stop continuation tested on exact pending peer wake; no model change, second wake, app restart or keyboard automation. A native failure remains unqualified.'})
 console.log(JSON.stringify({report,...outcome}));process.exitCode=outcome.ok?0:1
}
