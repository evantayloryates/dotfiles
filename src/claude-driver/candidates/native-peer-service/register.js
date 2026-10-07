// Candidate only. Public native calls remain top-level for the native validator.
// CONFIG is supplied as immutable generated source, never by peer input.
const attempted=new Set()
let active=false
export function register(on){on('session.receive',receiveServiceRead);on('session.start',recordServiceReady)}
async function recordServiceReady($,event,next){
 try{
  const session=await $.session.id(),cwd=await $.session.cwd(),now=await $.clock.now()
  if((session===CONFIG.brokerSession||session===CONFIG.brokerSession.slice(6))&&cwd===CONFIG.brokerCwd&&Number.isFinite(now)&&now>=CONFIG.notBefore&&now<=CONFIG.deadline){
   const file=CONFIG.brokerCwd+'/.native-service-'+CONFIG.id+'.ready.json'
   if(!await $.fs.exists(file))await $.fs.write(file,JSON.stringify({schemaVersion:1,scope:'owned-native-service-ready',serviceId:CONFIG.id,brokerSession:CONFIG.brokerSession,brokerCwd:CONFIG.brokerCwd,build:CONFIG.build,registeredAt:new Date(now).toISOString(),deadline:CONFIG.deadline,maxRequests:CONFIG.maxRequests,nativeCallsRequested:0,modelCallsRequested:0})+'\n')
  }
 }catch{} // Absence is not readiness; native loader errors remain independent.
 return next(event)
}
async function receiveServiceRead($,event,next){
 if(event?.origin?.kind!=='peer'||typeof event.text!=='string')return next(event)
 let text=event.text
 const prefix='<cross-session-message from-name="claude-driver" from-mode="bypass">\n',suffix='\n</cross-session-message>'
 if(text.startsWith(prefix)&&text.endsWith(suffix))text=text.slice(prefix.length,-suffix.length)
 if(!text.startsWith(CONFIG.token+' '))return next(event)
 // Owned control prefix never falls through into model input, even malformed.
 const requestId=text.slice(CONFIG.token.length+1)
 if(!/^rpeer[a-f0-9]{32}$/.test(requestId))return {consumed:'service-read-refused'}
 if(attempted.has(requestId))return {consumed:'service-read-already-attempted'}
 if(attempted.size>=CONFIG.maxRequests)return {consumed:'service-read-capacity'}
 attempted.add(requestId) // reserve before any await, including failed ownership
 // The sealed runtime has a shared dispatch checkpoint. Distinct concurrent
 // callbacks must not replace it while another native read is in flight.
 if(active)return {consumed:'service-read-busy'}
 active=true
 try{
  const session=await $.session.id(),cwd=await $.session.cwd(),now=await $.clock.now()
  if((session!==CONFIG.brokerSession&&session!==CONFIG.brokerSession.slice(6))||cwd!==CONFIG.brokerCwd||!Number.isFinite(now)||now<CONFIG.notBefore||now>CONFIG.deadline)return {consumed:'service-read-refused'}
  if(await $.fs.exists(CONFIG.brokerCwd+'/STOP')||await $.fs.exists(CONFIG.brokerCwd+'/stop-rescue-arm.json')||await $.fs.exists(CONFIG.brokerCwd+'/mechanical-probe.json'))return {consumed:'service-read-stopped'}
  const intent=CONFIG.brokerCwd+'/.native-service-'+requestId+'.intent.json',response=CONFIG.brokerCwd+'/.native-service-'+requestId+'.result.json'
  if(await $.fs.exists(intent)||await $.fs.exists(response))return {consumed:'service-read-prior-evidence'}
  await $.fs.write(intent,JSON.stringify({schemaVersion:1,scope:'owned-native-service-intent',serviceId:CONFIG.id,requestId,brokerSession:CONFIG.brokerSession,startedAt:new Date(now).toISOString()})+'\n')
  const command='/opt/homebrew/bin/node "/Users/taylor/.local/state/claude-driver/releases/'+CONFIG.build+'/scripts/broker-check.mjs" '+requestId+' 0 --dir "'+CONFIG.brokerCwd+'"'
  const checkpoint=await $.tool.call({tool:'Bash',command,timeout:5000,run_in_background:false})
  if(checkpoint?.deny!==undefined||checkpoint?.isError===true||typeof checkpoint?.text!=='string')return {consumed:'service-read-checkpoint-refused'}
  let checked;try{checked=JSON.parse(checkpoint.text.trim())}catch{return {consumed:'service-read-checkpoint-refused'}}
  if(checked?.dispatch!==true||checked.op!=='get_session'||Object.keys(checked).sort().join(',')!=='args,dispatch,op'||!checked.args||Object.keys(checked.args).join(',')!=='session_id'||!/^local_[a-f0-9-]{36}$/.test(checked.args.session_id)||checked.args.session_id===CONFIG.brokerSession)return {consumed:'service-read-checkpoint-refused'}
  const dispatchAt=await $.clock.now()
  if(!Number.isFinite(dispatchAt)||dispatchAt<now||dispatchAt>CONFIG.deadline)return {consumed:'service-read-expired'}
  if(await $.fs.exists(CONFIG.brokerCwd+'/STOP')||await $.fs.exists(CONFIG.brokerCwd+'/stop-rescue-arm.json')||await $.fs.exists(CONFIG.brokerCwd+'/mechanical-probe.json'))return {consumed:'service-read-stopped'}
  // Target comes only from the sealed lifecycle checkpoint, never peer text.
  const result=await $.mcp.call('ccd_session_mgmt','get_session',{session_id:checked.args.session_id})
  const receivedAt=await $.clock.now()
  if(typeof result?.isError!=='boolean'||!Array.isArray(result.content)||!Number.isFinite(receivedAt)||receivedAt<dispatchAt||receivedAt>CONFIG.deadline)return {consumed:'service-read-result-unresolved'}
  const receipt=JSON.stringify({schemaVersion:1,scope:'owned-native-service-result',serviceId:CONFIG.id,requestId,brokerSession:CONFIG.brokerSession,targetSession:checked.args.session_id,startedAt:new Date(now).toISOString(),receivedAt:new Date(receivedAt).toISOString(),isError:result.isError,content:result.content})+'\n'
  if(receipt.length>65536||await $.fs.exists(response))return {consumed:'service-read-result-unresolved'}
  await $.fs.write(response,receipt)
  return {consumed:'service-read-result-captured'}
 }catch{return {consumed:'service-read-unresolved'}}finally{active=false}
}
