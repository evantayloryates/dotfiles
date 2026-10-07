// Optional owned command marker. Only own/prior marker booleans leave the native
// command inventory; no command execution, model turn or retired token delivery.
async function recordServiceMarker($,event,next){
 try{
  const session=await $.session.id(),cwd=await $.session.cwd(),now=await $.clock.now()
  if((session!==CONFIG.brokerSession&&session!==CONFIG.brokerSession.slice(6))||cwd!==CONFIG.brokerCwd||!Number.isFinite(now)||now<CONFIG.notBefore||now>CONFIG.deadline)return next(event)
  const marker='claude-driver-service-marker-'+CONFIG.id
  await $.command.register({name:marker,description:'Owned native service lifecycle marker',immediate:true})
  const commands=await $.command.list()
  if(!Array.isArray(commands))return next(event)
  const own=commands.filter(c=>c.name===marker)
  const previous=CONFIG.observeRetiredServiceId===null?null:'claude-driver-service-marker-'+CONFIG.observeRetiredServiceId
  const file=CONFIG.brokerCwd+'/.native-service-'+CONFIG.id+'.marker.json'
  if(!await $.fs.exists(file))await $.fs.write(file,JSON.stringify({schemaVersion:1,scope:'owned-native-service-marker',serviceId:CONFIG.id,brokerSession:CONFIG.brokerSession,brokerCwd:CONFIG.brokerCwd,build:CONFIG.build,observedAt:new Date(now).toISOString(),ownMarkerPresent:own.length===1&&own[0].source==='plugin'&&own[0].plugin==='desktop-bridge-native-peer-service',previousServiceId:CONFIG.observeRetiredServiceId,previousMarkerPresent:previous===null?null:commands.some(c=>c.name===previous),modelCallsRequested:0})+'\n')
 }catch{} // Missing inventory evidence is never marker/unload qualification.
 return next(event)
}
async function runServiceMarker($,event,next){
 return {text:'Owned native service lifecycle marker; no read or model requested.'}
}
