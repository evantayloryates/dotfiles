// Metadata-only fixture. CONFIG is generated and fixed before native validation.
let active=false
export function register(on){on('session.receive',receiveScratchRead)}
async function receiveScratchRead($,event,next){
 if(event?.origin?.kind!=='peer'||typeof event.text!=='string')return next(event)
 let text=event.text
 const prefix='<cross-session-message from-name="claude-driver" from-mode="bypass">\n',suffix='\n</cross-session-message>'
 if(text.startsWith(prefix)&&text.endsWith(suffix))text=text.slice(prefix.length,-suffix.length)
 if(!text.startsWith(CONFIG.token))return next(event)
 const slot=CONFIG.requests.indexOf(text)
 if(slot<0||active)return {consumed:'scratch-read-refused'}
 active=true
 try{
  const now=await $.clock.now(),session=await $.session.id(),cwd=await $.session.cwd()
  if(!Number.isFinite(now)||now<CONFIG.notBefore||now>CONFIG.deadline||(session!==CONFIG.receiver&&session!==CONFIG.receiver.slice(6))||cwd!==CONFIG.cwd)return {consumed:'scratch-read-refused'}
  const stem=CONFIG.cwd+'/.native-scratch-read-'+CONFIG.id+'-'+slot,intent=stem+'.intent.json',resultFile=stem+'.result.json'
  if(await $.fs.exists(intent)||await $.fs.exists(resultFile))return {consumed:'scratch-read-prior-attempt'}
  await $.fs.write(intent,JSON.stringify({schemaVersion:1,scope:'owned-scratch-read-intent',probeId:CONFIG.id,slot,receiver:CONFIG.receiver,target:CONFIG.target,startedAt:now})+'\n')
  // Fixed metadata read only. Peer input never supplies native arguments.
  const result=await $.mcp.call('ccd_session_mgmt','get_session',{session_id:CONFIG.target})
  const at=await $.clock.now()
  if(typeof result?.isError!=='boolean'||!Array.isArray(result.content)||!Number.isFinite(at)||at<now||at>CONFIG.deadline)return {consumed:'scratch-read-unresolved'}
  const body=JSON.stringify({schemaVersion:1,scope:'owned-scratch-read-result',probeId:CONFIG.id,slot,receiver:CONFIG.receiver,target:CONFIG.target,startedAt:now,receivedAt:at,isError:result.isError,content:result.content})+'\n'
  if(body.length>65536||await $.fs.exists(resultFile))return {consumed:'scratch-read-unresolved'}
  await $.fs.write(resultFile,body)
  return {consumed:'scratch-read-result-captured'}
 }catch{return {consumed:'scratch-read-unresolved'}}finally{active=false}
}
