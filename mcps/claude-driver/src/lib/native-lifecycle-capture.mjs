import {join} from 'node:path'
import {homedir} from 'node:os'
import {collectNativeLifecycle} from './native-lifecycle.mjs'
import {lifecycleEvent} from './lifecycle-log.mjs'
import {STATE_DIR,readJson,writeJsonAtomic,withLock} from './state.mjs'
export async function captureNativeLifecycle(sessionId){
 return withLock('native-lifecycle',async()=>{
  const file=join(STATE_DIR,'native-lifecycle-cursor.json'),prior=readJson(file,null)
  const result=collectNativeLifecycle({file:join(homedir(),'Library','Logs','Claude','main.log'),sessionId,cursor:prior?.cursor})
  let recorded=0
  for(const native of result.events){
   if(!lifecycleEvent('native-lifecycle',{native}).recorded)return {available:result.available,recorded,gap:result.gap,checkpointed:false}
   recorded++
  }
  if(result.gap!==prior?.gap&&!lifecycleEvent('native-log-coverage',{category:result.gap||'continuous'}).recorded)return {available:result.available,recorded,gap:result.gap,checkpointed:false}
  writeJsonAtomic(file,{cursor:result.cursor,gap:result.gap,observedAt:new Date().toISOString()})
  return {available:result.available,recorded,gap:result.gap,checkpointed:true,bytesRead:result.bytesRead}
 },{timeoutMs:3000})
}
