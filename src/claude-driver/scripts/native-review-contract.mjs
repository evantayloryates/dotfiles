import {createHash} from 'node:crypto'
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x
export function nativeReviewOrigin(c,rows,job){
 const replies=rows.filter(r=>r.event==='reply'&&r.name==='driver_wait'&&r.state==='completed'&&r.receiptVerified===true),ids=[...new Set(replies.map(r=>r.jobId))],submission=c?.submission
 if(c?.nativeSteer!==true||c?.nativeSend!==true||ids.length!==1||job?.state!=='completed'||job.id!==ids[0]||job.operation!=='steer_session'||submission?.operation!==job.operation||JSON.stringify(canonical(job.args))!==JSON.stringify(canonical(submission.arguments)))throw Error('review requires exact existing completed steer parent')
 const fingerprint=createHash('sha256').update(JSON.stringify(canonical({operation:submission.operation,args:submission.arguments,timeout_sec:submission.timeout_sec}))).digest('hex')
 if(job.fingerprint!==fingerprint||job.result?.route!=='independent-native-interrupt'||job.result.serviceId!==c.serviceId||job.result.sessionId!==c.target)throw Error('review parent binding mismatch')
 return job.id
}

export const NATIVE_REVIEW_SCHEMA={type:'object',properties:{status:{type:'string',enum:['NATIVE_MCP_OK','NATIVE_MCP_FAILED']}},required:['status'],additionalProperties:false}
export function nativeReviewVerdict(final,harness){
 if(harness!=='claude')return final?.item?.text?.trim()==='NATIVE_MCP_OK'
 const value=final?.structured_output;return !!(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).join(',')==='status'&&value.status==='NATIVE_MCP_OK')
}
