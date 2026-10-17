// One exact native metadata job, not a general desktop relay.
export const NATIVE_CONTRACT_TOOLS=['driver_guide','broker_service_status','driver_submit','driver_wait']
const ordered=x=>Array.isArray(x)?x.map(ordered):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,ordered(x[k])])):x
const same=(a,b)=>JSON.stringify(ordered(a))===JSON.stringify(ordered(b))
export function permittedNativeContractCall(contract,jobs,name,args={}){
 if(!args||typeof args!=='object'||Array.isArray(args))return false
 if(name==='driver_guide')return same(args,{})
 if(name==='broker_service_status')return same(args,{session:contract.session,service_id:contract.serviceId})
 if(name==='driver_submit')return same(args,contract.submission)
 if(name==='driver_wait')return Object.keys(args).every(k=>['job_id','timeout_sec','include_result'].includes(k))&&jobs.has(args.job_id)&&typeof args.timeout_sec==='number'&&args.timeout_sec>0&&args.timeout_sec<=30&&args.include_result===true
 return false
}
const requiredOperationalChecks=['processSucceeded','noExternalToolCalls','freshSchema','exactTwoSubmissions','sameJob','verifiedNativeReceipt','derivedRequestId','noRefusedCalls','noModelTurn','sourceUnchanged','globalConfigUnchanged']
export function classifyNativeContractChecks(checks){
 const nativeContractVerified=!!checks&&requiredOperationalChecks.every(k=>checks[k]===true),ok=nativeContractVerified&&checks.finalMarker===true
 return {ok,nativeContractVerified,failureCategory:ok?null:nativeContractVerified?'harness_output_format':'native_contract_failed'}
}
