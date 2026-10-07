#!/usr/bin/env node
// Fixed diagnostic native reads, attached to one bounded no-tools broker turn.
// Target only the existing owned broker/fixture; capture metadata, not transcript
// text. No recovery, new chat, generic mutation or hook-result fiction.
import {constants,existsSync,openSync,closeSync,readSync,fstatSync,lstatSync,renameSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {randomBytes} from 'node:crypto'
import {join,basename} from 'node:path'
import {homedir} from 'node:os'
import {brokerInfo} from '../lib/broker.mjs'
import {stopRescuePolicy} from '../lib/stop-rescue.mjs'
import {stageRelease} from '../lib/releases.mjs'
import {getRecord,readPins,liveByHost} from '../lib/sessions.mjs'
import {deliver} from '../lib/peer.mjs'
import {sessionEvents} from '../lib/events.mjs'
import {STATE_DIR,BROKER_DIR,loadRegistry,withLock,writeJsonAtomic} from '../lib/state.mjs'
import {installTemporaryHookProbe,prepareTemporaryHookPeer,restoreTemporaryHookProbe,ownedBytes,bytesHash} from '../lib/temporary-hooks.mjs'
import {RUNTIME_BUILD,runtimeFingerprint} from '../lib/build.mjs'
import {recordMemory} from '../lib/memory.mjs'
import {MAIN_LOG,DESKTOP_CONFIG,versions,sleep} from '../lib/paths.mjs'
import {nativeHookResult,nativeHookEventError,nativeExportReturnName} from '../lib/native-hook-receipts.mjs'
import {summarizeNativeSnapshot} from '../lib/native-export-snapshot.mjs'
if(process.argv.length!==3||!['--run-owned-stop-export-probe','--run-owned-stop-read-probe','--run-owned-stop-batch-read-probe','--run-owned-stop-read-edges-probe','--run-owned-stop-broker-snapshot-probe'].includes(process.argv[2]))throw Error('explicit owned Stop diagnostic read probe flag required')
const exportBroker=process.argv[2]==='--run-owned-stop-broker-snapshot-probe',operation=exportBroker||process.argv[2]==='--run-owned-stop-export-probe'?'export_transcript':'get_session',includeBrokerRead=process.argv[2]==='--run-owned-stop-batch-read-probe',readEdges=process.argv[2]==='--run-owned-stop-read-edges-probe'
const sid='local_35b3ba48-f02e-48de-bfbb-925192d90de1',fixtureId='local_fc1e5eab-9d24-4e4c-a09c-9a386a6ffe14',fixtureCwd=join(STATE_DIR,'probe','v2-2026-10-07T04-37-49-840Z')
const epoch={sessionId:sid,pid:71262,procStart:'Wed Oct  7 03:24:51 2026'},token=randomBytes(16).toString('hex'),prefix=join(STATE_DIR,'pressure','native-hook-export-'+new Date().toISOString().replace(/[:.]/g,'-')),report=prefix+'.json',receiptPath=prefix+'.stop.json'
const targetId=exportBroker?sid:fixtureId,targetIds=includeBrokerRead?[fixtureId,sid]:[targetId]
const out={scope:exportBroker?'owned-native-broker-export-snapshot':'owned-native-stop-hook-read',operation,targetIds,readEdges,...(readEdges?{configuredDuplicateReads:2,expectedDistinctReadReceipts:1}:{}),token,versions:versions(),runtimeBuild:RUNTIME_BUILD,epoch,fixtureId,rows:[],ok:false,limitations:['Owned metadata reads are native hook dispatch evidence, not a general request transport or mutation admission/result contract','Hook-result attachments are genuine native hook receipts, not assistant tool-use receipts','The triggering no-tools turn uses one native model turn; hook execution and observation use no inference','Commandless errors belong only to their native event; they cannot identify which tool failed or establish a native invocation','A native snapshot captured during Stop is an observation, not post-turn quiescence or release authorization']}
let installed=false,logFd,logStart,logOffset,peer,foreignTurn=false,observedStop=false
const chain=new Set()
let journalFd,journalIdentity,journalOffset
const seenResults=new Set()
function hookResults(deadline){
 const stat=fstatSync(journalFd)
 if(stat.dev!==journalIdentity.dev||stat.ino!==journalIdentity.ino||stat.size<journalOffset||stat.size-journalOffset>256*1024)throw Error('native hook journal changed or exceeded bound')
 const b=Buffer.alloc(stat.size-journalOffset);readSync(journalFd,b,0,b.length,journalOffset);const end=b.lastIndexOf(10);if(end<0)return[]
 journalOffset+=end+1;const results=[]
 for(const line of b.subarray(0,end).toString().split('\n')){let row;try{row=JSON.parse(line)}catch{continue}
  const opts={cliSessionId:sid.slice(6),cwd:BROKER_DIR,chain,notBefore:out.startedAt,notAfter:deadline},command=row?.attachment?.command
  const result=nativeHookEventError(row,opts)||command==='ccd_session_mgmt/'+operation&&nativeHookResult(row,{...opts,command})
  // Rows may land after the public causal scan. A proved receipt is itself an
  // ancestor for the next hook attachment in this private bounded batch.
  if(result&&!seenResults.has(result.uuid)){seenResults.add(result.uuid);chain.add(result.uuid);results.push(result)}
 }
 return results
}
const same=i=>i.sessionId===sid&&i.live?.pid===epoch.pid&&i.live.procStart===epoch.procStart&&i.live.entrypoint==='claude-desktop'&&i.permissionMode==='bypassPermissions'&&i.runtime?.integrity&&!i.handoffStopped
function exportsSince(cli){
 const stat=fstatSync(logFd);if(stat.ino!==logStart.ino||stat.dev!==logStart.dev||stat.size<logOffset||stat.size-logOffset>256*1024)throw Error('native log changed or exceeded bound')
 const b=Buffer.alloc(stat.size-logOffset);readSync(logFd,b,0,b.length,logOffset);const end=b.lastIndexOf(10);if(end<0)return[]
 logOffset+=end+1
 const paths=[]
 for(const line of b.subarray(0,end).toString().split('\n')){
  if(line.includes('[shareSession] Starting export for session '+targetId))out.nativeExportStarted=true
  const marker='[transcriptExport] Session '+cli+' exported to ',at=line.indexOf(marker)
  if(at<0)continue
  const match=line.slice(at+marker.length).match(/^(\/[^\r\n]+\/session-export-[0-9]+\.zip) \(([0-9]+) bytes, ([0-9]+) files\)/)
  if(match&&match[1].startsWith(join(homedir(),'Downloads')+'/'))paths.push({path:match[1],bytes:Number(match[2]),files:Number(match[3])})
 }
 return paths
}
function validateExport(entry,target){
 const s=lstatSync(entry.path);if(s.isSymbolicLink()||!s.isFile()||s.uid!==process.getuid()||s.size!==entry.bytes||s.size>16*1024*1024||s.mtimeMs<out.startedAt)throw Error('native export file identity refused')
 const bytes=ownedBytes(entry.path,16*1024*1024)
 // Python stdlib reads only the two bounded metadata members; it never renders
 // a conversation. Duplicate entries, unrelated CLI IDs and logs refuse.
 const code=`import json,sys,zipfile
p,host,cli,archived=sys.argv[1:]
with zipfile.ZipFile(p) as z:
 infos=z.infolist(); names=[x.filename for x in infos]
 assert len(infos)<256 and len(names)==len(set(names))
 assert 'metadata.json' in names and 'local-session-state.json' in names and cli+'.jsonl' in names
 assert not any(x.startswith('logs/') or x.startswith('/') or '..' in x.split('/') for x in names)
 for n in ['metadata.json','local-session-state.json']: assert z.getinfo(n).file_size<65536
 meta=json.loads(z.read('metadata.json')); state=json.loads(z.read('local-session-state.json'))
 assert meta['sessionId']==host and meta['cliSessionId']==cli and state['sessionId']==host and state['cliSessionId']==cli
 assert meta['isArchived'] is (archived=='true')
 keys=['capturedAt','sessionId','cliSessionId','isRunning','hasPendingPermission','hasLiveWorkflows','hasBackgroundWork','hasBackgroundActivity','activeBackgroundTasks','pendingEchoUuids','awaitingTurnResult','cliLastTurnMessageWasResult','cliAtTurnBoundaryHint','interruptResultPendingSince','interruptResultPendingCycleArmed','cliProvablyIdle','inputStreamHasPending','nextCycleUuid','hasPendingCycle','pendingCycleUserMessageUuid','deferredSendUuids','heldSteersUuids','toolMayBeRunning']
 private={k:state[k] for k in keys if k in state}
 print(json.dumps({'metadataVerified':True,'entries':len(names),'cliSessionId':cli,'sessionId':host,'archived':archived=='true','rawSnapshot':private}))`
 const result=JSON.parse(execFileSync('/usr/bin/python3',['-c',code,entry.path,targetId,target.cliSessionId,exportBroker?'false':'true'],{encoding:'utf8',timeout:3000,maxBuffer:65536}))
 const snapshot=summarizeNativeSnapshot(result.rawSnapshot,{sessionId:targetId,cliSessionId:target.cliSessionId,notBefore:out.startedAt,notAfter:out.startedAt+60000});delete result.rawSnapshot
 if(bytesHash(ownedBytes(entry.path,16*1024*1024))!==bytesHash(bytes))throw Error('native export changed during metadata read')
 const destination=prefix+'.zip'
 renameSync(entry.path,destination)
 if(bytesHash(ownedBytes(destination,16*1024*1024))!==bytesHash(bytes)||existsSync(entry.path))throw Error('native export transfer readback failed')
 return {...result,snapshot,path:destination,nativeDownloadName:basename(entry.path),sha256:bytesHash(bytes),bytes:bytes.length,downloadsCopyRemoved:true}
}
try{
 await withLock('broker',async()=>{
  const before=brokerInfo(),policy=stopRescuePolicy(),fixture=getRecord(fixtureId),owned=loadRegistry().sessions[fixtureId]
  if(!same(before)||before.live.status!=='idle'||before.resident?.resident||!policy||policy.quietWait||existsSync(join(BROKER_DIR,'stop-rescue-arm.json'))||existsSync(join(BROKER_DIR,'quiet-hook-owner.json'))||existsSync(join(BROKER_DIR,'STOP'))||fixture?.cwd!==fixtureCwd||owned?.kind!=='create'||owned.cwd!==fixtureCwd||!fixture.cliSessionId||fixture.isArchived!==true||readPins().has(fixtureId)||liveByHost().has(fixtureId))throw Error('exact idle broker/archived fixture admission refused')
  const target=exportBroker?getRecord(sid):fixture
  if(exportBroker&&(target?.cwd!==BROKER_DIR||target.cliSessionId!==sid.slice(6)||target.isArchived!==false))throw Error('exact owned broker export identity refused')
  if(readEdges){
   const reserved='claude_driver_probe_unconnected',files=[join(homedir(),'.claude.json'),DESKTOP_CONFIG,join(BROKER_DIR,'.mcp.json'),join(BROKER_DIR,'.claude/settings.json')]
   for(const file of files){if(!existsSync(file))continue;const config=JSON.parse(ownedBytes(file,1024*1024)),project=config.projects?.[BROKER_DIR];if([config.mcpServers,config.mcp?.servers,project?.mcpServers,project?.mcp?.servers].some(x=>x&&Object.hasOwn(x,reserved)))throw Error('reserved diagnostic server name is configured')}
   out.diagnosticServerConfiguredCollision=false
  }
  const release=await stageRelease();out.probeBuild=release.build
  let cursor=sessionEvents({session:sid}).cursor
  const cursorData=JSON.parse(Buffer.from(cursor,'base64url').toString()),broker=getRecord(sid),journalPath=join(homedir(),'.claude','projects',broker.cwd.replace(/[^A-Za-z0-9]/g,'-'),broker.cliSessionId+'.jsonl')
  journalFd=openSync(journalPath,constants.O_RDONLY|constants.O_NOFOLLOW);journalIdentity=fstatSync(journalFd);journalOffset=cursorData.offset
  if(journalIdentity.uid!==process.getuid()||!journalIdentity.isFile()||cursorData.identity!==broker.cliSessionId+':'+journalIdentity.dev+':'+journalIdentity.ino)throw Error('native hook cursor identity refused')
  logFd=openSync(MAIN_LOG,'r');logStart=fstatSync(logFd);logOffset=logStart.size;out.startedAt=Date.now()
  const deadline=out.startedAt+60000
  try{
   installTemporaryHookProbe(BROKER_DIR,{token,epoch,observerScript:join(release.root,'scripts','mechanical-probe-stop.mjs'),receiptPath,fixtureId,expiresAt:deadline,operation,includeBrokerRead,readEdges,exportBroker});installed=true
   out.settingsHash=stopRescuePolicy({allowTemporaryProbe:true}).settingsHash
   await sleep(1500)
   peer=await deliver({...before,permissionMode:before.permissionMode},'claude-driver mechanical read probe '+token+'. Finish this diagnostic turn with exactly '+token+' and no tools. The service Stop hook owns the exact broker/fixture diagnostic read. Do not execute requests, waiters, maintenance, recovery or change settings.',{method:'direct',priority:'now',timeoutMs:5000,onPrepared:p=>prepareTemporaryHookPeer(BROKER_DIR,token,p)})
   out.peer={msgId:peer.msgId,pid:peer.pid,procStart:peer.procStart}
   while(Date.now()<deadline){
    if(!same(brokerInfo()))throw Error('native epoch changed during hook probe')
    const events=sessionEvents({session:sid,cursor,include_causality:true,limit:100});cursor=events.cursor
    for(const e of events.events){
     if(e.type==='user'&&e.peerMessageId===peer.msgId){out.userUuid=e.id;chain.add(e.id);continue}
     if(e.type==='user'&&e.peerMessageId!==peer.msgId)foreignTurn=true
     if(e.sidechain||!chain.has(e.parentId))continue
     chain.add(e.id)
     if(e.type==='assistant'){out.rows.push({uuid:e.id,parentId:e.parentId,stopReason:e.stopReason,tools:e.tools});if(e.tools?.some(x=>x.endsWith('__export_transcript')))out.assistantExportCall=true}
    }
    if(existsSync(receiptPath)){const witness=JSON.parse(ownedBytes(receiptPath));observedStop=witness.token===token&&witness.msgId===peer.msgId&&witness.epoch.pid===epoch.pid&&witness.epoch.procStart===epoch.procStart&&witness.settingsHash===out.settingsHash&&witness.userUuid===out.userUuid;out.stopWitness=observedStop}
    for(const r of hookResults(deadline)){
     if(r.source==='native-hook-event-error'){
      out.eventErrors??=[];out.eventErrors.push({source:r.source,uuid:r.uuid,parentUuid:r.parentUuid,at:r.at,event:r.event,hookEventId:r.hookEventId,commandBound:false,stderrHash:bytesHash(r.stderr)});continue
     }
     out.nativeResults??=[];out.nativeResults.push({source:r.source,uuid:r.uuid,parentUuid:r.parentUuid,at:r.at,command:r.command,event:r.event,hookEventId:r.hookEventId,ok:r.ok,stdoutHash:bytesHash(r.stdout),stderrHash:bytesHash(r.stderr)})
     if(r.ok&&r.command==='ccd_session_mgmt/get_session'){let m;try{m=JSON.parse(r.stdout)}catch{}
      if(targetIds.includes(m?.sessionId)&&(m.sessionId!==fixtureId||m.isArchived===true&&m.pinned===false)){
       out.metadata??=[];out.metadata.push({sessionId:m.sessionId,archived:m.isArchived,pinned:m.pinned,isRunning:m.isRunning,verified:true})
      }
     }
     if(r.ok&&operation==='export_transcript'){
      const name=nativeExportReturnName(r.stdout);if(name)out.nativeReturnExportName=name
     }
    }
    const exports=exportsSince(target.cliSessionId)
    for(const entry of exports){out.exports??=[];out.exports.push(validateExport(entry,target))}
    if(observedStop&&out.nativeResults?.length===targetIds.length&&(!readEdges||out.eventErrors?.length===1)&&(operation==='get_session'?out.metadata?.length===targetIds.length:out.exports?.length)&&brokerInfo().live.status==='idle')break
    if(observedStop&&brokerInfo().live.status==='idle'&&Date.now()-out.startedAt>12000)break
    await sleep(250)
   }
   out.foreignTurn=foreignTurn
   const success=out.nativeResults?.filter(r=>r.ok&&r.command==='ccd_session_mgmt/'+operation)??[],failures=out.nativeResults?.filter(r=>!r.ok)??[]
   out.eventFailureObserved=readEdges&&out.eventErrors?.length===1&&success.length===1&&out.eventErrors[0].hookEventId===success[0].hookEventId
   const resultVerified=out.nativeResults?.length===targetIds.length&&success.length===targetIds.length&&failures.length===0&&(readEdges?out.eventFailureObserved:!out.eventErrors?.length)&&(operation==='get_session'?out.metadata?.length===targetIds.length&&JSON.stringify(out.metadata.map(m=>m.sessionId).sort())===JSON.stringify(targetIds.slice().sort()):out.nativeExportStarted===true&&out.exports?.length===1&&out.exports[0].nativeDownloadName===out.nativeReturnExportName)
   out.ok=observedStop&&resultVerified&&!out.assistantExportCall&&!foreignTurn&&out.rows.every(e=>!e.tools?.length)&&out.rows.some(e=>e.stopReason==='end_turn')
   if(!out.ok)out.failure='Native Stop/read result conjunction not proved; absence does not identify MCP-context failure'
  }finally{
   if(!same(brokerInfo()))throw Error('native epoch changed; temporary hook ownership must be reconciled')
   if(installed){out.restoration=restoreTemporaryHookProbe(BROKER_DIR,token);installed=false}
  }
 },{timeoutMs:10000})
}catch(e){out.ok=false;out.failure=String(e.message).slice(0,300);if(installed||existsSync(join(BROKER_DIR,'mechanical-probe.json')))out.restorePending=true}
finally{
 if(logFd!==undefined)closeSync(logFd)
 if(journalFd!==undefined)closeSync(journalFd)
 out.sourceChanged=runtimeFingerprint()!==RUNTIME_BUILD;out.ok=!!out.ok&&!out.sourceChanged&&out.restoration?.restored===true
 const i=brokerInfo(),f=getRecord(fixtureId);out.after={pid:i.live?.pid,status:i.live?.status,integrity:i.runtime?.integrity,fixtureArchived:f?.isArchived,fixturePinned:readPins().has(fixtureId),fixtureLive:liveByHost().has(fixtureId)}
 writeJsonAtomic(report,out);recordMemory({kind:'test_result',topic:exportBroker?'native-broker-snapshot':'native-direct-hook-read',source:'owned-native-probe',status:out.ok?'passed':'failed',evidence:report,lesson:'Bounded Stop-hook read binds exact native ancestry, hook receipt and owned export metadata, with private transcript/queue contents excluded. A Stop-time queue snapshot does not authorize release or settle historical unknowns. Preserve failures and exact settings restoration.'})
 console.log(JSON.stringify({report,...out}));process.exitCode=out.ok?0:1
}
