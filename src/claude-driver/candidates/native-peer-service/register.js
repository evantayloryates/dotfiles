// Candidate only. Public native calls remain top-level for the native validator.
// CONFIG is supplied as immutable generated source, never by peer input.
const attempted=new Set()
let active=false,ready=false
export function register(on){on('session.receive',receiveServiceRead);on('session.start',recordServiceReady)}
async function recordServiceReady($,event,next){
 try{
  const session=await $.session.id(),cwd=await $.session.cwd(),now=await $.clock.now()
  if((session===CONFIG.brokerSession||session===CONFIG.brokerSession.slice(6))&&cwd===RECEIVER_CWD&&Number.isFinite(now)&&now>=CONFIG.notBefore&&now<=CONFIG.deadline){
   const file=CONFIG.brokerCwd+'/.native-service-'+CONFIG.id+'.ready.json'
   if(!await $.fs.exists(file)){
    await $.fs.write(file,JSON.stringify({schemaVersion:1,scope:'owned-native-service-ready',serviceId:CONFIG.id,brokerSession:CONFIG.brokerSession,brokerCwd:CONFIG.brokerCwd,build:CONFIG.build,registeredAt:new Date(now).toISOString(),deadline:CONFIG.deadline,maxRequests:CONFIG.maxRequests,nativeCallsRequested:0,modelCallsRequested:0})+'\n')
    ready=true
   }
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
 if(text===CONFIG.token+' ready'){
  if(active)return {consumed:'service-read-busy'}
  active=true
  try{
   const session=await $.session.id(),cwd=await $.session.cwd(),now=await $.clock.now()
   if((session!==CONFIG.brokerSession&&session!==CONFIG.brokerSession.slice(6))||cwd!==RECEIVER_CWD||!Number.isFinite(now)||now<CONFIG.notBefore||now>CONFIG.deadline)return {consumed:'service-read-not-ready'}
   if(!ready)await recordServiceReady($,{},()=>{})
   return {consumed:ready&&await $.fs.exists(CONFIG.brokerCwd+'/.native-service-'+CONFIG.id+'.ready.json')?'service-read-ready':'service-read-not-ready'}
  }catch{return {consumed:'service-read-not-ready'}}finally{active=false}
 }
 // Owned control prefix never falls through into model input, even malformed.
 const requestId=text.slice(CONFIG.token.length+1)
 if(!/^rpeer[a-f0-9]{32}$/.test(requestId))return {consumed:'service-read-refused'}
 if(!ready)return {consumed:'service-read-not-ready'}
 if(attempted.has(requestId))return {consumed:'service-read-already-attempted'}
 if(attempted.size>=CONFIG.maxRequests)return {consumed:'service-read-capacity'}
 attempted.add(requestId) // reserve before any await, including failed ownership
 // The sealed runtime has a shared dispatch checkpoint. Distinct concurrent
 // callbacks must not replace it while another native read is in flight.
 if(active)return {consumed:'service-read-busy'}
 active=true
 try{
  const session=await $.session.id(),cwd=await $.session.cwd(),now=await $.clock.now()
  if((session!==CONFIG.brokerSession&&session!==CONFIG.brokerSession.slice(6))||cwd!==RECEIVER_CWD||!Number.isFinite(now)||now<CONFIG.notBefore||now>CONFIG.deadline)return {consumed:'service-read-refused'}
  if(!await $.fs.exists(CONFIG.brokerCwd+'/.native-service-'+CONFIG.id+'.ready.json'))return {consumed:'service-read-not-ready'}
  if(await $.fs.exists(CONFIG.brokerCwd+'/STOP')||await $.fs.exists(CONFIG.brokerCwd+'/stop-rescue-arm.json')||await $.fs.exists(CONFIG.brokerCwd+'/mechanical-probe.json'))return {consumed:'service-read-stopped'}
  const intent=CONFIG.brokerCwd+'/.native-service-'+requestId+'.intent.json',response=CONFIG.brokerCwd+'/.native-service-'+requestId+'.result.json'
  if(await $.fs.exists(intent)||await $.fs.exists(response))return {consumed:'service-read-prior-evidence'}
  await $.fs.write(intent,JSON.stringify({schemaVersion:1,scope:'owned-native-service-intent',serviceId:CONFIG.id,requestId,brokerSession:CONFIG.brokerSession,startedAt:new Date(now).toISOString()})+'\n')
  const command=CHECKPOINT_PREFIX+requestId+' 0 --dir '+CHECKPOINT_DIR
  const checkpoint=await $.tool.call({tool:'Bash',command,timeout:5000,run_in_background:false})
  if(checkpoint?.deny!==undefined||checkpoint?.isError===true||typeof checkpoint?.text!=='string')return {consumed:'service-read-checkpoint-refused'}
  let checked;try{checked=JSON.parse(checkpoint.text.trim())}catch{return {consumed:'service-read-checkpoint-refused'}}
  if(checked?.dispatch===false&&Object.keys(checked).sort().join(',')==='dispatch,reason'&&['invalid_request','request_generation_mismatch','cancelled','expired','already_dispatched_or_unclaimed'].includes(checked.reason)){
   const at=await $.clock.now(),file=CONFIG.brokerCwd+'/.native-service-'+requestId+'.no-dispatch.json'
   if(Number.isFinite(at)&&at>=now&&at<=CONFIG.deadline&&!await $.fs.exists(file))await $.fs.write(file,JSON.stringify({schemaVersion:1,scope:'owned-native-service-no-dispatch',serviceId:CONFIG.id,requestId,brokerSession:CONFIG.brokerSession,observedAt:new Date(at).toISOString(),reason:checked.reason,nativeMcpCallsRequested:0,modelCallsRequested:0})+'\n')
   return {consumed:'service-read-checkpoint-refused'}
  }
  if(checked?.dispatch!==true||Object.keys(checked).sort().join(',')!=='args,dispatch,op'||!checked.args)return {consumed:'service-read-checkpoint-refused'}
  const family=CONFIG.serviceStateBinding!==undefined&&checked.op==='list_sessions'&&Object.keys(checked.args).sort().join(',')==='include_archived,limit,linked'&&checked.args.include_archived===true&&checked.args.limit===100&&checked.args.linked===true
  const single=checked.op==='get_session'&&Object.keys(checked.args).join(',')==='session_id'&&/^local_[a-f0-9-]{36}$/.test(checked.args.session_id)&&checked.args.session_id!==CONFIG.brokerSession
  const archive=CONFIG.serviceStateBinding!==undefined&&CONFIG.archiveTarget!==undefined&&checked.op==='archive_session'&&Object.keys(checked.args).sort().join(',')==='reason,session_id'&&checked.args.session_id===CONFIG.archiveTarget.sessionId&&checked.args.reason==='claude-driver scoped recovery test'
  const wake=CONFIG.serviceStateBinding!==undefined&&CONFIG.archiveTarget!==undefined&&checked.op==='send_message'&&Object.keys(checked.args).sort().join(',')==='message,session_id'&&checked.args.session_id===CONFIG.archiveTarget.sessionId&&checked.args.message==='Reply exactly COLD_RECEIVER_READY. Do not invoke tools or change files, settings or permissions.'
  const ordinaryTarget=CONFIG.serviceStateBinding!==undefined&&CONFIG.sessionManagementControl===true&&/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(checked.args.session_id)&&checked.args.session_id!==CONFIG.brokerSession
  const ordinaryUnarchive=ordinaryTarget&&checked.op==='unarchive_session'&&Object.keys(checked.args).join(',')==='session_id'
  const ordinaryPin=ordinaryTarget&&checked.op==='set_pinned'&&Object.keys(checked.args).sort().join(',')==='pinned,session_id'&&typeof checked.args.pinned==='boolean'
  const metadataTarget=CONFIG.serviceStateBinding!==undefined&&CONFIG.metadataTarget!==undefined&&checked.args.session_id===CONFIG.metadataTarget.sessionId
  const title=metadataTarget&&checked.op==='set_session_title'&&Object.keys(checked.args).sort().join(',')==='session_id,title'&&typeof checked.args.title==='string'&&checked.args.title.trim().length>0&&checked.args.title.length<=200&&!checked.args.title.includes('\0')
  const pin=metadataTarget&&checked.op==='set_pinned'&&Object.keys(checked.args).sort().join(',')==='pinned,session_id'&&typeof checked.args.pinned==='boolean'
  const effort=metadataTarget&&checked.op==='set_session_effort'&&Object.keys(checked.args).sort().join(',')==='effort,session_id'&&['low','medium','high','xhigh','max'].includes(checked.args.effort)
  const nativeStop=metadataTarget&&CONFIG.metadataStopControl===true&&checked.op==='stop_session'&&Object.keys(checked.args).join(',')==='session_id'
  const nativeSend=metadataTarget&&CONFIG.metadataSendControl===true&&checked.op==='send_message'&&Object.keys(checked.args).sort().join(',')==='message,session_id'&&typeof checked.args.message==='string'&&checked.args.message.length>0&&checked.args.message.length<=16000&&checked.args.message===checked.args.message.trim()&&!checked.args.message.includes('\0')
  const model=metadataTarget&&CONFIG.metadataModelControl===true&&checked.op==='set_session_model'&&Object.keys(checked.args).sort().join(',')==='model,session_id'&&typeof checked.args.model==='string'&&/^claude-(haiku|sonnet|opus)-[a-z0-9][a-z0-9._-]{0,79}$/.test(checked.args.model)
  if(!ordinaryUnarchive&&!ordinaryPin&&!family&&!single&&!archive&&!wake&&!title&&!pin&&!effort&&!model&&!nativeSend&&!nativeStop)return {consumed:'service-read-checkpoint-refused'}
  const dispatchAt=await $.clock.now()
  if(!Number.isFinite(dispatchAt)||dispatchAt<now||dispatchAt>CONFIG.deadline)return {consumed:'service-read-expired'}
  if(await $.fs.exists(CONFIG.brokerCwd+'/STOP')||await $.fs.exists(CONFIG.brokerCwd+'/stop-rescue-arm.json')||await $.fs.exists(CONFIG.brokerCwd+'/mechanical-probe.json'))return {consumed:'service-read-stopped'}
  // Target comes only from the sealed lifecycle checkpoint, never peer text.
  const result=ordinaryUnarchive?await $.mcp.call('ccd_session_mgmt','unarchive_session',{session_id:checked.args.session_id}):ordinaryPin?await $.mcp.call('ccd_sidebar','set_pinned',{session_id:checked.args.session_id,pinned:checked.args.pinned}):nativeStop?await $.mcp.call('ccd_session_mgmt','stop_session',{session_id:CONFIG.metadataTarget.sessionId}):nativeSend?await $.mcp.call('ccd_session_mgmt','send_message',{session_id:CONFIG.metadataTarget.sessionId,message:checked.args.message}):model?await $.mcp.call('ccd_session_mgmt','set_session_model',{session_id:CONFIG.metadataTarget.sessionId,model:checked.args.model}):title?await $.mcp.call('ccd_session_mgmt','set_session_title',{session_id:CONFIG.metadataTarget.sessionId,title:checked.args.title}):pin?await $.mcp.call('ccd_sidebar','set_pinned',{session_id:CONFIG.metadataTarget.sessionId,pinned:checked.args.pinned}):effort?await $.mcp.call('ccd_session_mgmt','set_session_effort',{session_id:CONFIG.metadataTarget.sessionId,effort:checked.args.effort}):wake?await $.mcp.call('ccd_session_mgmt','send_message',{session_id:CONFIG.archiveTarget.sessionId,message:'Reply exactly COLD_RECEIVER_READY. Do not invoke tools or change files, settings or permissions.'}):archive?await $.mcp.call('ccd_session_mgmt','archive_session',{session_id:CONFIG.archiveTarget.sessionId,reason:'claude-driver scoped recovery test'}):family?await $.mcp.call('ccd_session_mgmt','list_sessions',{include_archived:true,limit:100,linked:true}):await $.mcp.call('ccd_session_mgmt','get_session',{session_id:checked.args.session_id})
  const receivedAt=await $.clock.now()
  if(typeof result?.isError!=='boolean'||!Array.isArray(result.content)||!Number.isFinite(receivedAt)||receivedAt<dispatchAt||receivedAt>CONFIG.deadline)return {consumed:'service-read-result-unresolved'}
  const receipt=JSON.stringify({schemaVersion:1,scope:'owned-native-service-result',serviceId:CONFIG.id,requestId,brokerSession:CONFIG.brokerSession,targetSession:family?CONFIG.brokerSession:checked.args.session_id,startedAt:new Date(now).toISOString(),receivedAt:new Date(receivedAt).toISOString(),isError:result.isError,content:result.content})+'\n'
  if(receipt.length>65536||await $.fs.exists(response))return {consumed:'service-read-result-unresolved'}
  await $.fs.write(response,receipt)
  return {consumed:'service-read-result-captured'}
 }catch{return {consumed:'service-read-unresolved'}}finally{active=false}
}
