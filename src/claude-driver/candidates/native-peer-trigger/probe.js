import {diagnosticFailure} from '../native-mod-probe/diagnostic-failure.js'
// Staged one-attempt read. Configuration must be fixed before native enrollment.
// fs.write is not exclusive: durable evidence is NOT a cross-process lock.
export function createDurableReadProbe({id,intent,report,brokerSession,targetSession,notBefore,deadline}){
 if(!/^[a-f0-9-]{36}$/.test(id)||!intent.startsWith('/')||!report.startsWith('/')||!brokerSession.startsWith('local_')||!targetSession.startsWith('local_')||!Number.isFinite(notBefore)||!Number.isFinite(deadline)||deadline<=notBefore)throw Error('invalid probe configuration')
 let attempted=false
 return async $=>{
  if(attempted)return {status:'already-attempted'}
  attempted=true
  if(await $.fs.exists(intent)||await $.fs.exists(report))return {status:'prior-evidence'}
  const now=await $.clock.now()
  if(!Number.isFinite(now)||now<notBefore||now>deadline)return {status:'outside-window'}
  const base={schemaVersion:1,scope:'owned-native-peer-read',probeId:id,brokerSession,targetSession,startedAt:new Date(now).toISOString(),gateQualified:false,releaseAuthorized:false,modelCallsRequested:0}
  await $.fs.write(intent,JSON.stringify({...base,complete:false})+'\n')
  const outcome={...base,complete:true,nativeCallReturned:false,resultWasError:null,failureCategory:null}
  try{
   const dispatchAt=await $.clock.now()
   if(!Number.isFinite(dispatchAt)||dispatchAt<now||dispatchAt>deadline)outcome.failureCategory='dispatch-window-refused'
   else{
    const result=await $.mcp.call('ccd_session_mgmt','get_session',{session_id:targetSession})
    outcome.nativeCallReturned=true
    outcome.resultWasError=typeof result?.isError==='boolean'?result.isError:null
   }
  }catch(error){outcome.failureCategory=diagnosticFailure(error)}
  try{const end=await $.clock.now();if(Number.isFinite(end)&&end>=now)outcome.completedAt=new Date(end).toISOString()}catch{}
  try{await $.fs.write(report,JSON.stringify(outcome)+'\n');return {status:'report-written'}}catch{return {status:'report-write-failed'}}
 }
}
