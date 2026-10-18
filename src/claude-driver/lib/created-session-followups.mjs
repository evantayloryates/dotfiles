import {createHash} from 'node:crypto'
import {join} from 'node:path'
import {writeFileSync} from 'node:fs'
import {STATE_DIR,ensureDir,writeJsonAtomic} from './state.mjs'
import {ordinarySessionArguments} from './ordinary-session-control.mjs'
import {DriverError} from './paths.mjs'
export function createdSessionFollowupPlan(session,args,jobId){
 if(!/^j[a-f0-9]{32}$/.test(jobId||'')||!/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(session||'')||args.group!==undefined||args.via_broker!==undefined)throw new DriverError('native creation followups require durable ownership and no group or alternate route',{category:'bad_args'})
 const steps=[]
 if(args.lock_title){ordinarySessionArguments('set_session_title',{sessionId:session},args.title);steps.push({operation:'rename_session',arguments:{session,title:args.title}})}
 if(args.first_message){ordinarySessionArguments('send_message',{sessionId:session},args.first_message);steps.push({operation:'send_message',arguments:{session,message:args.first_message}})}
 return steps.map(step=>({...step,contextId:'j'+createHash('sha256').update('created-followup:'+jobId+':'+step.operation).digest('hex').slice(0,32)}))
}
export async function runCreatedSessionFollowups(steps,d){
 const results=[]
 for(const step of steps){await d.guard();await d.record('before-'+step.operation,results);const r=await d.apply(step);results.push({operation:step.operation,contextId:step.contextId,result:r});await d.record('after-'+step.operation,results);if(r?.verified!==true||r.receiptVerified!==true||step.operation==='send_message'&&(r.nativeAccepted!==true||!['delivered','queued'].includes(r.delivery))||step.operation==='rename_session'&&(r.titleSource!=='tool'||r.title!==step.arguments.title))throw Error('creation followup unverified')}
 return results
}
export async function routeCreatedSessionFollowups(session,args,ctx){
 const steps=createdSessionFollowupPlan(session,args,ctx.jobId),file=join(ensureDir(join(STATE_DIR,'created-session-followups')),ctx.jobId+'.json'),ledger={schemaVersion:1,jobId:ctx.jobId,sessionId:session,contexts:steps.map(s=>({operation:s.operation,contextId:s.contextId})),phase:'prepared',at:Date.now(),retrySafe:false}
 writeFileSync(file,JSON.stringify(ledger),{flag:'wx',mode:0o600})
 const record=(phase,results)=>{ledger.phase=phase;ledger.results=results;writeJsonAtomic(file,ledger)}
 try{const results=await runCreatedSessionFollowups(steps,{guard:async()=>{if(ctx.signal?.aborted)throw Error('cancelled')},record,apply:async step=>{const {runOp}=await import('./driver.mjs');return runOp(step.operation,step.arguments,{...ctx,jobId:step.contextId})}});record('completed',results);return {results,routeFile:file}}
 catch(error){ledger.phase='unresolved';ledger.failure={category:error.category??'created_followup_unresolved',at:Date.now()};writeJsonAtomic(file,ledger);throw new DriverError('session created but followups unresolved; inspect original child contexts before retrying',{category:'created_followup_unresolved',detail:{sessionId:session,created:true,routeFile:file,contexts:ledger.contexts,followupCategory:error.category??'unverified',humanAction:error.detail?.humanAction,retrySafe:false}})}
}
