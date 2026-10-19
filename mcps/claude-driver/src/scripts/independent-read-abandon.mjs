#!/usr/bin/env node
import {join} from 'node:path'
import {writeFileSync} from 'node:fs'
import {BROKER_DIR,withLock} from '../lib/state.mjs'
import {loadIndependentServiceContext,independentJson} from '../lib/independent-service-context.mjs'
import {requireIndependentOfflineMutation} from '../lib/independent-offline-review.mjs'
import {runOfflineReadAbandonment} from '../lib/offline-read-abandonment.mjs'
const [session,serviceId,id,jobId]=process.argv.slice(2),file=join(BROKER_DIR,'.offline-read-abandoned-'+id+'.json')
try{
 if(process.argv.slice(2).length!==4)throw Error('exact abandonment scope required')
 const result=await runOfflineReadAbandonment(id,jobId,{lock:fn=>withLock('broker',fn,{timeoutMs:10000}),context:()=>loadIndependentServiceContext(session,serviceId,{offlineOnly:true}),absence:pointer=>requireIndependentOfflineMutation(pointer,session),now:Date.now,write:marker=>writeFileSync(file,JSON.stringify(marker)+'\n',{flag:'wx',mode:0o600}),read:()=>independentJson(file)})
 console.log(JSON.stringify(result))
}catch{console.error('offline metadata read abandonment refused; preserve original request and inspect exact job without replay');process.exitCode=1}
