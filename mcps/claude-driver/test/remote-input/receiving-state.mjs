// Independent fixture delivery settlement, extracted from owner-native's
// existing bounded observer. Never issues input or treats tool return as effect.
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'

export async function settleReceivingState({path,pid,text,timeoutMs=5000,stableMs=100,intervalMs=25},{read=()=>JSON.parse(readFileSync(path)),now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 const started=now(),expectedHash=createHash('sha256').update(text).digest('hex'),observations=[]
 let stableSince,lastReadError
 while(now()-started<timeoutMs){
  let value;try{value=read()}catch(e){lastReadError=e.code??e.name;stableSince=undefined;await sleep(intervalMs);continue}
  const time=now()
  if(value.pid!==pid)return {verified:false,reason:'fixture-process-changed',elapsedMs:time-started,observations,inputAttempts:1}
  if(observations.at(-1)?.sha256!==value.sha256){observations.push({elapsedMs:time-started,characters:value.characters,sha256:value.sha256});if(observations.length>16)observations.shift()}
  const exact=value.characters===text.length&&value.utf8Bytes===Buffer.byteLength(text)&&value.sha256===expectedHash
  if(!exact)stableSince=undefined
  else{stableSince??=time;if(time-stableSince>=stableMs)return {verified:true,elapsedMs:time-started,stableMs:time-stableSince,observations,inputAttempts:1}}
  await sleep(intervalMs)
 }
 return {verified:false,reason:'receiving-state-not-settled',elapsedMs:now()-started,observations,inputAttempts:1,...lastReadError?{lastReadError}:{}}
}
