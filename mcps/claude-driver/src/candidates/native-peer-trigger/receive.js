// Staged adapter only: no registration, installation or automatic effects.
// The caller must supply a separately reviewed one-use probe and exact token.
export function registerPeerTrigger(on,{token,brokerSession,brokerCwd,deadline,run}){
 if(typeof token!=='string'||!/^claude-driver native-check [a-f0-9]{32}$/.test(token)||typeof brokerSession!=='string'||!brokerSession.startsWith('local_')||typeof brokerCwd!=='string'||!brokerCwd.startsWith('/')||typeof run!=='function'||!Number.isFinite(deadline))throw Error('invalid fixed trigger configuration')
 let consumed=false
 on('session.receive',async($,event,next)=>{
  if(event?.origin?.kind!=='peer'||event.text!==token&&event.text!==`<cross-session-message from-name="claude-driver" from-mode="bypass">\n${token}\n</cross-session-message>`)return next(event)
  // Matching delivery is always consumed, including refusal: never becomes
  // model instructions or queues an unintended model turn.
  if(consumed)return {consumed:'native-check-already-consumed'}
  consumed=true
  try{
   const id=await $.session.id(),cwd=await $.session.cwd(),now=await $.clock.now()
   if((id!==brokerSession&&id!==brokerSession.slice(6))||cwd!==brokerCwd||!Number.isFinite(now)||now>deadline)return {consumed:'native-check-refused'}
   await run($)
   return {consumed:'native-check-completed'}
  }catch{
   // Preserve one-use consumption and never expose private exception text.
   // Durable intent/report responsibility stays with the supplied probe.
   return {consumed:'native-check-failed'}
  }
 })
}
