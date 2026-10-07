#!/usr/bin/env node
// One model-free native export hook, attached to one bounded no-tools broker
// turn. Export only the existing owned synthetic fixture; capture metadata, not
// transcript text. No recovery, new chat, generic mutation or hook-result fiction.
import {existsSync,openSync,closeSync,readSync,fstatSync,lstatSync,renameSync,readFileSync} from 'node:fs'
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
import {MAIN_LOG,versions,sleep} from '../lib/paths.mjs'
if(process.argv.length!==3||process.argv[2]!=='--run-owned-stop-export-probe')throw Error('explicit --run-owned-stop-export-probe required')
const sid='local_35b3ba48-f02e-48de-bfbb-925192d90de1',fixtureId='local_fc1e5eab-9d24-4e4c-a09c-9a386a6ffe14',fixtureCwd=join(STATE_DIR,'probe','v2-2026-10-07T04-37-49-840Z')
const epoch={sessionId:sid,pid:71262,procStart:'Wed Oct  7 03:24:51 2026'},token=randomBytes(16).toString('hex'),prefix=join(STATE_DIR,'pressure','native-hook-export-'+new Date().toISOString().replace(/[:.]/g,'-')),report=prefix+'.json',receiptPath=prefix+'.stop.json'
const out={scope:'owned-native-stop-hook-export',token,versions:versions(),runtimeBuild:RUNTIME_BUILD,epoch,fixtureId,rows:[],ok:false,limitations:['One exported synthetic fixture is native hook dispatch evidence, not a general request transport or mutation admission/result contract','Export writes a local archive; its actual tool return is not an assistant-tool receipt','The triggering no-tools turn uses one native model turn; hook execution and observation use no inference']}
let installed=false,logFd,logStart,logOffset,peer,foreignTurn=false,observedStop=false
const chain=new Set()
const same=i=>i.sessionId===sid&&i.live?.pid===epoch.pid&&i.live.procStart===epoch.procStart&&i.live.entrypoint==='claude-desktop'&&i.permissionMode==='bypassPermissions'&&i.runtime?.integrity&&!i.handoffStopped
function exportsSince(cli){
 const stat=fstatSync(logFd);if(stat.ino!==logStart.ino||stat.dev!==logStart.dev||stat.size<logOffset||stat.size-logOffset>256*1024)throw Error('native log changed or exceeded bound')
 const b=Buffer.alloc(stat.size-logOffset);readSync(logFd,b,0,b.length,logOffset);const end=b.lastIndexOf(10);if(end<0)return[]
 logOffset+=end+1
 const paths=[]
 for(const line of b.subarray(0,end).toString().split('\n')){
  if(line.includes('[shareSession] Starting export for session '+fixtureId))out.nativeExportStarted=true
  const marker='[transcriptExport] Session '+cli+' exported to ',at=line.indexOf(marker)
  if(at<0)continue
  const match=line.slice(at+marker.length).match(/^(\/[^\r\n]+\/session-export-[0-9]+\.zip) \(([0-9]+) bytes, ([0-9]+) files\)/)
  if(match&&match[1].startsWith(join(homedir(),'Downloads')+'/'))paths.push({path:match[1],bytes:Number(match[2]),files:Number(match[3])})
 }
 return paths
}
function validateExport(entry,fixture){
 const s=lstatSync(entry.path);if(s.isSymbolicLink()||!s.isFile()||s.uid!==process.getuid()||s.size!==entry.bytes||s.size>16*1024*1024||s.mtimeMs<out.startedAt)throw Error('native export file identity refused')
 // Python stdlib reads only the two bounded metadata members; it never renders
 // a conversation. Duplicate entries, unrelated CLI IDs and logs refuse.
 const code=`import json,sys,zipfile\np,host,cli=sys.argv[1:]\nwith zipfile.ZipFile(p) as z:\n infos=z.infolist(); names=[x.filename for x in infos]\n assert len(infos)<256 and len(names)==len(set(names))\n assert 'metadata.json' in names and 'local-session-state.json' in names and cli+'.jsonl' in names\n assert not any(x.startswith('logs/') or x.startswith('/') or '..' in x.split('/') for x in names)\n for n in ['metadata.json','local-session-state.json']: assert z.getinfo(n).file_size<65536\n meta=json.loads(z.read('metadata.json')); state=json.loads(z.read('local-session-state.json'))\n assert meta['sessionId']==host and meta['cliSessionId']==cli and state['sessionId']==host and state['cliSessionId']==cli\n assert meta['isArchived'] is True\n print(json.dumps({'metadataVerified':True,'entries':len(names),'cliSessionId':cli,'sessionId':host,'archived':True,'capturedAt':state['capturedAt'],'isRunning':state.get('isRunning'),'cliProvablyIdle':state.get('cliProvablyIdle'),'hasPendingCycle':state.get('hasPendingCycle'),'toolMayBeRunning':state.get('toolMayBeRunning')}))` 
 const result=JSON.parse(execFileSync('/usr/bin/python3',['-c',code,entry.path,fixtureId,fixture.cliSessionId],{encoding:'utf8',timeout:3000,maxBuffer:65536}))
 const destination=prefix+'.zip',bytes=ownedBytes(entry.path,16*1024*1024)
 renameSync(entry.path,destination)
 if(bytesHash(ownedBytes(destination,16*1024*1024))!==bytesHash(bytes)||existsSync(entry.path))throw Error('native export transfer readback failed')
 return {...result,path:destination,sha256:bytesHash(bytes),bytes:bytes.length,downloadsCopyRemoved:true}
}
try{
 await withLock('broker',async()=>{
  const before=brokerInfo(),policy=stopRescuePolicy(),fixture=getRecord(fixtureId),owned=loadRegistry().sessions[fixtureId]
  if(!same(before)||before.live.status!=='idle'||before.resident?.resident||!policy||policy.quietWait||existsSync(join(BROKER_DIR,'stop-rescue-arm.json'))||existsSync(join(BROKER_DIR,'quiet-hook-owner.json'))||existsSync(join(BROKER_DIR,'STOP'))||fixture?.cwd!==fixtureCwd||owned?.kind!=='create'||owned.cwd!==fixtureCwd||!fixture.cliSessionId||fixture.isArchived!==true||readPins().has(fixtureId)||liveByHost().has(fixtureId))throw Error('exact idle broker/archived fixture admission refused')
  const release=await stageRelease();out.probeBuild=release.build
  let cursor=sessionEvents({session:sid}).cursor
  logFd=openSync(MAIN_LOG,'r');logStart=fstatSync(logFd);logOffset=logStart.size;out.startedAt=Date.now()
  const deadline=out.startedAt+60000
  try{
   installTemporaryHookProbe(BROKER_DIR,{token,epoch,observerScript:join(release.root,'scripts','mechanical-probe-stop.mjs'),receiptPath,fixtureId,expiresAt:deadline});installed=true
   out.settingsHash=stopRescuePolicy().settingsHash
   await sleep(1500)
   peer=await deliver({...before,permissionMode:before.permissionMode},'claude-driver mechanical read probe '+token+'. Finish this diagnostic turn with exactly '+token+' and no tools. The service Stop hook owns a read-only synthetic-fixture export. Do not execute requests, waiters, maintenance, recovery or change settings.',{method:'direct',priority:'now',timeoutMs:5000,onPrepared:p=>prepareTemporaryHookPeer(BROKER_DIR,token,p)})
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
    const exports=exportsSince(fixture.cliSessionId)
    for(const entry of exports){out.exports??=[];out.exports.push(validateExport(entry,fixture))}
    if(observedStop&&out.exports?.length&&brokerInfo().live.status==='idle')break
    if(observedStop&&brokerInfo().live.status==='idle'&&Date.now()-out.startedAt>12000)break
    await sleep(250)
   }
   out.foreignTurn=foreignTurn
   out.ok=observedStop&&out.nativeExportStarted===true&&out.exports?.length===1&&!out.assistantExportCall&&!foreignTurn&&out.rows.every(e=>!e.tools?.length)&&out.rows.some(e=>e.stopReason==='end_turn')
   if(!out.ok)out.failure='Native Stop/export artifact conjunction not proved; absence does not identify MCP-context failure'
  }finally{
   if(!same(brokerInfo()))throw Error('native epoch changed; temporary hook ownership must be reconciled')
   if(installed){out.restoration=restoreTemporaryHookProbe(BROKER_DIR,token);installed=false}
  }
 },{timeoutMs:10000})
}catch(e){out.ok=false;out.failure=String(e.message).slice(0,300);if(installed)out.restorePending=true}
finally{
 if(logFd!==undefined)closeSync(logFd)
 out.sourceChanged=runtimeFingerprint()!==RUNTIME_BUILD;out.ok=!!out.ok&&!out.sourceChanged&&out.restoration?.restored===true
 const i=brokerInfo(),f=getRecord(fixtureId);out.after={pid:i.live?.pid,status:i.live?.status,integrity:i.runtime?.integrity,fixtureArchived:f?.isArchived,fixturePinned:readPins().has(fixtureId),fixtureLive:liveByHost().has(fixtureId)}
 writeJsonAtomic(report,out);recordMemory({kind:'test_result',topic:'native-direct-hook-export',source:'owned-native-probe',status:out.ok?'passed':'failed',evidence:report,lesson:'Bounded Stop-hook export probe checks native ancestry/peer witness and independent owned fixture archive metadata. Preserve failures and exact settings restoration. One artifact does not qualify generic mutation admission or FileChanged activation.'})
 console.log(JSON.stringify({report,...out}));process.exitCode=out.ok?0:1
}
