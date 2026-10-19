// Shared one-attempt child scheduling. Persist intent before submit, then the
// exact job handle before observation. Cancellation/uncertainty never resubmits.
const job=/^j[a-f0-9]{32}$/
export async function runDurableChild(context,step,submission,{signal,run}={}){
 const {ledger,save}=context
 if(!/^[a-z][-a-z0-9]{0,79}$/.test(step||'')||ledger.children[step])throw Error('durable child already attempted or invalid')
 const call=run??(async(op,args,ctx)=>(await import('./driver.mjs')).runOp(op,args,ctx))
 ledger.children[step]={submission:structuredClone(submission),phase:'before-submit'};save()
 if(signal?.aborted)throw Error('operation cancelled before child submission')
 const submitted=await call('driver_submit',submission)
 if(!job.test(submitted?.jobId||''))throw Error('durable scheduler handle unavailable')
 ledger.children[step].jobId=submitted.jobId;save()
 for(;;){if(signal?.aborted)throw Error('durable child may continue after cancellation');const observed=await call('driver_wait',{job_id:submitted.jobId,timeout_sec:10,include_result:true},{signal});ledger.children[step].observation=observed;save();if(observed.jobId!==submitted.jobId||observed.operation!==submission.operation)throw Error('durable child observation identity changed');if(observed.state==='completed')return observed.result;if(!['queued','running'].includes(observed.state))throw Error('durable child failed or uncertain')}
}
