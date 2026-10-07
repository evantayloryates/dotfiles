// Service-owned, finite diagnostic settings transaction. Caller holds the broker
// lock and validates the native epoch. No runtime pointer or core handler change.
import {constants,openSync,closeSync,fstatSync,readFileSync,writeFileSync,renameSync,unlinkSync,lstatSync} from 'node:fs'
import {createHash,randomUUID} from 'node:crypto'
import {join} from 'node:path'
export const bytesHash=bytes=>createHash('sha256').update(bytes).digest('hex')
export function ownedBytes(path,max=65536){
 const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK)
 try{const s=fstatSync(fd);if(!s.isFile()||s.uid!==process.getuid()||s.size>max)throw Error('probe file identity refused');const b=readFileSync(fd);if(b.length>max)throw Error('probe file bound exceeded');return b}finally{closeSync(fd)}
}
const atomic=(path,bytes)=>{const tmp=path+'.'+randomUUID()+'.tmp';writeFileSync(tmp,bytes,{mode:0o600,flag:'wx'});try{renameSync(tmp,path)}catch(e){unlinkSync(tmp);throw e}}
export function installTemporaryHookProbe(dir,{token,epoch,observerScript,receiptPath,fixtureId,expiresAt,operation='export_transcript'}){
 if(!['get_session','export_transcript'].includes(operation))throw Error('probe operation is not a diagnostic read')
 if(!/^[a-f0-9]{32}$/.test(token)||!/^local_[a-f0-9-]{36}$/.test(epoch?.sessionId)||!Number.isInteger(epoch?.pid)||epoch.pid<2||typeof epoch.procStart!=='string'||!/^local_[a-f0-9-]{36}$/.test(fixtureId)||fixtureId===epoch.sessionId||typeof observerScript!=='string'||!observerScript.startsWith('/')||typeof receiptPath!=='string'||!receiptPath.startsWith('/')||!Number.isFinite(expiresAt)||expiresAt<=Date.now()||expiresAt>Date.now()+90000)throw Error('probe descriptor refused')
 const ds=lstatSync(join(dir,'.claude'));if(ds.isSymbolicLink()||!ds.isDirectory()||ds.uid!==process.getuid())throw Error('probe settings directory refused')
 const settingsPath=join(dir,'.claude','settings.json'),policyPath=join(dir,'stop-rescue-policy.json'),ownerPath=join(dir,'mechanical-probe.json')
 const settingsBefore=ownedBytes(settingsPath),policyBefore=ownedBytes(policyPath),settings=JSON.parse(settingsBefore),policy=JSON.parse(policyBefore)
 if(policy.schemaVersion!==1||policy.sessionId!==epoch.sessionId||policy.pid!==epoch.pid||policy.procStart!==epoch.procStart||policy.settingsHash!==bytesHash(settingsBefore)||!settings.hooks?.Stop||!settings.hooks?.PreToolUse||policy.quietWait)throw Error('probe core policy refused')
 const hook={type:'mcp_tool',server:'ccd_session_mgmt',tool:operation,input:{session_id:fixtureId},timeout:5}
 const body=Buffer.from(JSON.stringify({...settings,hooks:{...settings.hooks,Stop:[...settings.hooks.Stop,{hooks:[{type:'command',command:process.execPath,args:[observerScript,ownerPath],timeout:5},hook]}]}},null,2))
 const policyAfter=Buffer.from(JSON.stringify({...policy,settingsHash:bytesHash(body)},null,2))
 const descriptor={schemaVersion:1,token,epoch,fixtureId,expiresAt,observerScript,observerHash:bytesHash(ownedBytes(observerScript)),receiptPath,settingsHash:bytesHash(body),policyHash:bytesHash(policyAfter),settingsBefore:settingsBefore.toString('base64'),policyBefore:policyBefore.toString('base64')}
 writeFileSync(ownerPath,JSON.stringify(descriptor),{mode:0o600,flag:'wx'})
 try{atomic(settingsPath,body);atomic(policyPath,policyAfter)}catch(e){restoreTemporaryHookProbe(dir,token);throw e}
 return {token,settingsHash:descriptor.settingsHash,policyHash:descriptor.policyHash,ownerPath}
}
export function prepareTemporaryHookPeer(dir,token,peer){
 const path=join(dir,'mechanical-probe.json'),bytes=ownedBytes(path),d=JSON.parse(bytes)
 if(d.token!==token||d.peer||peer.pid!==d.epoch.pid||peer.procStart!==d.epoch.procStart||typeof peer.msgId!=='string'||!/^[a-f0-9-]{36}$/.test(peer.msgId))throw Error('probe peer binding refused')
 atomic(path,Buffer.from(JSON.stringify({...d,peer})))
}
export function restoreTemporaryHookProbe(dir,token){
 const path=join(dir,'mechanical-probe.json'),d=JSON.parse(ownedBytes(path))
 if(d.schemaVersion!==1||d.token!==token||!Number.isInteger(d.epoch?.pid)||typeof d.settingsBefore!=='string'||typeof d.policyBefore!=='string')throw Error('probe restoration owner refused')
 const settingsPath=join(dir,'.claude','settings.json'),policyPath=join(dir,'stop-rescue-policy.json'),settings=ownedBytes(settingsPath),policy=ownedBytes(policyPath),oldSettings=Buffer.from(d.settingsBefore,'base64'),oldPolicy=Buffer.from(d.policyBefore,'base64')
 if(![d.settingsHash,bytesHash(oldSettings)].includes(bytesHash(settings))||![d.policyHash,bytesHash(oldPolicy)].includes(bytesHash(policy)))throw Error('probe restoration refuses another settings writer')
 atomic(settingsPath,oldSettings);atomic(policyPath,oldPolicy)
 if(bytesHash(ownedBytes(settingsPath))!==bytesHash(oldSettings)||bytesHash(ownedBytes(policyPath))!==bytesHash(oldPolicy))throw Error('probe restoration readback failed')
 unlinkSync(path)
 return {settingsHash:bytesHash(oldSettings),policyHash:bytesHash(oldPolicy),restored:true}
}
