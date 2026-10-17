// Deliberately missing-request probe: no protocol request/control is created.
// Consumes one permanent service slot and sends at most once.
export async function runNativePolicyProbe({requestId,timeoutMs,signal},d){
 let phase='preflight'
 try{
  if(!/^rpeer[a-f0-9]{32}$/.test(requestId)||!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>60000)throw Error('probe arguments')
  const check=()=>{if(signal?.aborted)throw Error('probe cancelled')}
  check();await d.preflight();check()
  phase='before-budget';await d.record(phase);await d.reserve()
  phase='before-send';await d.record(phase);check();await d.preflight();check()
  const deadline=d.now()+timeoutMs
  await d.send();phase='sent';await d.record(phase)
  for(;;){check();const result=await d.review();if(result?.terminalRefusalVerified){phase='verified';await d.record(phase);return result}if(d.now()>=deadline)throw Error('probe observation deadline');await d.wait()}
 }catch{const error=Error('native policy probe refused or unresolved');error.phase=phase;error.requestId=requestId;error.retrySafe=false;throw error}
}
