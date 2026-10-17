import {constants,openSync,closeSync,fstatSync,readSync} from 'node:fs'
import {join} from 'node:path'
import {homedir} from 'node:os'
import {transcriptPath} from './peer-direct.mjs'
// Current CLI2.1.299 native notification grammar, independently inspected in
// installed Eo/Ro. Observation only: no consent grant or generation readiness.
export function screenNativeModLoading(rows,{session,folder,notBefore,now=Date.now()}){
 const empty={loaderNotificationObserved:false,loaderOutcome:'unknown',consentAuthorized:false,generationReadinessAssessed:false}
 if(!Array.isArray(rows)||rows.length>2048||!/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(session||'')||!Number.isFinite(notBefore)||!Number.isFinite(now)||notBefore>now)return empty
 const prefix='The person enabled mod hot-reloading for this session',messages=new Map([
  [prefix+' and the mods under '+folder+' loaded: they load and reload by themselves as their files change; the transcript names any mod that failed.','loaded'],
  [prefix+', but the mods under '+folder+' wait for /reload-plugins (the load would rewrite the prompt cache): they are NOT loaded yet.','held'],
  [prefix+', but the mods under '+folder+' did not load (this session cannot reload its plugins; only a restart loads them).','unbound'],
  [prefix+', but the mods under '+folder+' did not load (the load failed; the transcript says why, and /reload-plugins tries again).','failed'],
  ['The person declined mod hot-reloading: what this run wrote under '+folder+' is written but NOT loaded (a mod that loaded when the session started keeps running as it loaded). Do not say the change is running. It loads the next time this session starts (/reload-plugins reloads only a mod that loaded at the start); the person can ask again.','declined'],
  ['The person has not answered the mod hot-reloading question yet; it is asked again once a turn ends. What this run wrote under '+folder+' is written but NOT loaded yet. Do not say it was declined, and do not suggest --plugin-dir or a restart.','unanswered']
 ])
 let latest
 for(const row of rows){
  if(row?.type!=='queue-operation'||row.operation!=='enqueue'||row.sessionId!==session.slice(6)||typeof row.content!=='string'||row.content.length>4096)continue
  const at=Date.parse(row.timestamp);if(!Number.isFinite(at)||new Date(at).toISOString()!==row.timestamp||at<notBefore||at>now)continue
  let outcome=messages.get(row.content)
  // Unknown/off notifications invalidate a prior positive, never re-enable.
  if(!outcome&&row.content.startsWith('Mod hot-reloading is off in this session (')&&row.content.endsWith('): mods under '+folder+' are not loaded.'))outcome='off'
  if(outcome&&(!latest||at>=latest.at))latest={at,outcome}
 }
 return latest?{...empty,loaderNotificationObserved:true,loaderOutcome:latest.outcome,loaderObservedAt:new Date(latest.at).toISOString()}:empty
}
export function observeNativeModLoading(peer,{now=Date.now()}={}){
 if(peer.version!=='2.1.299')throw Error('unreviewed mod notification grammar')
 const file=transcriptPath(peer),fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK)
 try{
  const before=fstatSync(fd);if(!before.isFile()||before.uid!==process.getuid())throw Error('journal ownership')
  const offset=Math.max(0,before.size-262144),buffer=Buffer.alloc(before.size-offset);let n=0
  while(n<buffer.length){const count=readSync(fd,buffer,n,buffer.length-n,offset+n);if(!count)throw Error('journal changed');n+=count}
  const after=fstatSync(fd);if(before.dev!==after.dev||before.ino!==after.ino||before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs)throw Error('journal changed')
  const lines=buffer.toString('utf8').split('\n');if(offset)lines.shift();if(lines.length>2049)throw Error('journal row bound')
  const rows=lines.filter(Boolean).map(line=>JSON.parse(line)),session=peer.hostSessionId,folder=join(process.env.CLAUDE_CONFIG_DIR||join(homedir(),'.claude'),'dev-mods',session.slice(6)),notBefore=Date.parse(peer.procStart+' UTC')
  return {...screenNativeModLoading(rows,{session,folder,notBefore,now}),loaderJournalWindowBytes:buffer.length}
 }finally{closeSync(fd)}
}
