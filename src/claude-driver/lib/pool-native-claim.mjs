import {createHash} from 'node:crypto'
import {join} from 'node:path'
import {writeFileSync,realpathSync} from 'node:fs'
import {STATE_DIR,ensureDir,writeJsonAtomic} from './state.mjs'
import {getRecord} from './sessions.mjs'
import {poolOf,setEntry,BYPASS} from './pool.mjs'
import {ordinarySessionBinding,ordinarySessionArguments} from './ordinary-session-control.mjs'
import {DriverError} from './paths.mjs'
export function poolNativeClaimPlan(session,args,jobId,archived){
 if(!/^j[a-f0-9]{32}$/.test(jobId||'')||!/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(session||'')||typeof archived!=='boolean'||args.group!==undefined||args.via_broker!==undefined)throw new DriverError('native pool claim requires durable exact scope',{category:'bad_args'})
 for(const [op,key]of [['set_session_title','title'],['set_session_model','model'],['set_session_effort','effort']])ordinarySessionArguments(op,{sessionId:session},args[key])
 if(args.first_message)ordinarySessionArguments('send_message',{sessionId:session},args.first_message)
 const steps=[...archived?[{operation:'unarchive_session',arguments:{session}}]:[],{operation:'set_session_config',arguments:{session,title:args.title,model:args.model,effort:args.effort}},...args.first_message?[{operation:'send_message',arguments:{session,message:args.first_message}}]:[]]
 return steps.map(s=>({...s,contextId:'j'+createHash('sha256').update('pool-claim:'+jobId+':'+s.operation).digest('hex').slice(0,32)}))
}
export function poolClaimBindingTransition(before,after,operation){
 return !!(before&&after&&['version','sessionId','cwd','storeHash'].every(k=>before[k]===after[k])&&(before.cliSessionId===after.cliSessionId||operation==='unarchive_session'&&before.cliSessionId===null&&after.cliSessionId===before.sessionId.slice(6)))
}
export async function runPoolNativeClaim(steps,d){
 const results=[]
 for(const step of steps){await d.guard();if(step.operation==='send_message')await d.verify({operation:'set_session_config'});await d.record('before-'+step.operation,results);const result=await d.apply(step);results.push({operation:step.operation,contextId:step.contextId,result});await d.record('after-'+step.operation,results)
  if(step.operation==='send_message'?(result?.verified!==true||result.receiptVerified!==true||result.nativeAccepted!==true||!['delivered','queued'].includes(result.delivery)):step.operation==='set_session_config'?(result?.verified!==true||result.receiptVerified!==true):result?.unarchived!==true)throw Error('pool claim step unverified')
  await d.verify(step)
 }
 return results
}
export async function routePoolNativeClaim(session,args,ctx){
 const r=getRecord(session);if(realpathSync(r.cwd)!==args.folder||r.permissionMode!==BYPASS)throw new DriverError('claimed record does not match requested folder and approved mode',{category:'pool_claim_unqualified',detail:{sessionId:session,claimReserved:true,retrySafe:false}})
 const controller=(await import('./session-management-controller.mjs')).sessionManagementController(session),initialBinding=ordinarySessionBinding(r,controller),steps=poolNativeClaimPlan(session,args,ctx.jobId,r.isArchived),file=join(ensureDir(join(STATE_DIR,'pool-native-claims')),ctx.jobId+'.json'),ledger={schemaVersion:1,jobId:ctx.jobId,sessionId:session,binding:initialBinding,contexts:steps.map(s=>({operation:s.operation,contextId:s.contextId})),phase:'prepared',at:Date.now(),retrySafe:false}
 let binding=initialBinding
 writeFileSync(file,JSON.stringify(ledger),{flag:'wx',mode:0o600})
 // Before native intent, pin the claim against ordinary stale-claim recycling.
 await setEntry(session,{claimUnresolved:true,claimJobId:ctx.jobId})
 const guard=async()=>{const current=getRecord(session),claim=poolOf()[session];if(ctx.signal?.aborted||claim?.state!=='claimed'||claim.claimJobId!==ctx.jobId||claim.claimUnresolved!==true||claim.claimedTitle!==args.title||current.permissionMode!==BYPASS||JSON.stringify(ordinarySessionBinding(current,controller))!==JSON.stringify(binding))throw Error('pool claim owner or identity changed')}
 const record=(phase,results)=>{ledger.phase=phase;ledger.results=results;writeJsonAtomic(file,ledger)}
 try{const results=await runPoolNativeClaim(steps,{guard,record,apply:async step=>{const {runOp}=await import('./driver.mjs');return runOp(step.operation,step.arguments,{...ctx,jobId:step.contextId})},verify:async step=>{const current=getRecord(session);if(step.operation==='unarchive_session'){const after=ordinarySessionBinding(current,controller);if(current.isArchived!==false||!poolClaimBindingTransition(binding,after,step.operation))throw Error('pool unarchive identity drift');binding=after;ledger.afterUnarchiveBinding=after;record('unarchive-identity-verified',ledger.results)}if(step.operation==='set_session_config'&&(current.isArchived!==false||current.title!==args.title||current.titleSource!=='tool'||current.model!==args.model||current.effort!==args.effort||current.permissionMode!==BYPASS))throw Error('pool saved configuration mismatch')}});record('completed',results);await setEntry(session,{claimUnresolved:undefined});return {results,routeFile:file}}
 catch(error){ledger.phase='unresolved';ledger.failure={category:error.category??'pool_claim_unresolved',at:Date.now()};writeJsonAtomic(file,ledger);throw new DriverError('pool claim reserved after uncertain configuration; do not claim or send again',{category:'pool_claim_unresolved',detail:{sessionId:session,claimReserved:true,routeFile:file,contexts:ledger.contexts,humanAction:error.detail?.humanAction,retrySafe:false}})}
}
