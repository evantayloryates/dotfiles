// Opening a record is not proof that its native desktop worker started.
// Observe an owned peer before restoring focus; never wake, send or recover here.
import {realpathSync} from 'node:fs'
import {peerRecord} from './peer-direct.mjs'
import {sleep} from './paths.mjs'
export async function waitNativePeer(record,{timeoutMs,signal,observe=peerRecord,now=Date.now,pause=sleep}={}){
 const end=now()+timeoutMs,unverified=reason=>({verified:false,reason,servingVerified:false,inferenceVerified:false})
 do{
  if(signal?.aborted)return unverified('cancelled')
  const peer=observe(record.sessionId)
  if(peer?.entrypoint==='claude-desktop'&&peer.sessionId===(record.cliSessionId||record.sessionId.replace(/^local_/,''))&&['idle','busy','working','running'].includes(peer.status)){
   try{if(realpathSync(peer.cwd)===realpathSync(record.cwd))return {verified:true,pid:peer.pid,procStart:peer.procStart,cliSessionId:peer.sessionId,version:peer.version,status:peer.status,servingVerified:false,inferenceVerified:false}}catch{}
  }
  if(now()>=end)break
  await pause(Math.min(200,end-now()))
 }while(now()<=end)
 return unverified('native-peer-timeout')
}
