// Optional owned command marker. Observe after session.start has returned so
// the host's command refresh can publish the registration. No command execution.
async function recordServiceReady($,event,next){
 try{
  const session=await $.session.id(),cwd=await $.session.cwd(),now=await $.clock.now()
  if((session!==CONFIG.brokerSession&&session!==CONFIG.brokerSession.slice(6))||cwd!==CONFIG.brokerCwd||!Number.isFinite(now)||now<CONFIG.notBefore||now>CONFIG.deadline)return next(event)
  const marker='claude-driver-service-marker-'+CONFIG.id
  const registration=await $.command.register({name:marker,description:'Owned native service lifecycle marker',immediate:true})
  const readyFile=CONFIG.brokerCwd+'/.native-service-'+CONFIG.id+'.ready.json'
  if(!await $.fs.exists(readyFile))await $.fs.write(readyFile,JSON.stringify({schemaVersion:1,scope:'owned-native-service-ready',serviceId:CONFIG.id,brokerSession:CONFIG.brokerSession,brokerCwd:CONFIG.brokerCwd,build:CONFIG.build,registeredAt:new Date(now).toISOString(),deadline:CONFIG.deadline,maxRequests:CONFIG.maxRequests,nativeCallsRequested:0,modelCallsRequested:0})+'\n')
  const file=CONFIG.brokerCwd+'/.native-service-'+CONFIG.id+'.marker.json'
  if(!await $.fs.exists(file))$.clock.after(250,async()=>{
   try{
    const observedAt=await $.clock.now(),commands=await $.command.list()
    if(!Number.isFinite(observedAt)||observedAt<now||observedAt>CONFIG.deadline||!Array.isArray(commands))return
    const own=commands.filter(c=>c.name===marker),nameMatches=own.length===1,sourceMatches=nameMatches&&own[0].source==='plugin',ownerMatches=nameMatches&&own[0].plugin===$.plugin.name,rootMatches=$.plugin.root==='/Users/taylor/.claude/dev-mods/'+CONFIG.brokerSession.slice(6)+'/desktop-bridge-native-peer-service',registrationConfirmed=registration?.command===marker
    const previous=CONFIG.observeRetiredServiceId===null?null:'claude-driver-service-marker-'+CONFIG.observeRetiredServiceId
    if(!await $.fs.exists(file))await $.fs.write(file,JSON.stringify({schemaVersion:1,scope:'owned-native-service-marker',serviceId:CONFIG.id,brokerSession:CONFIG.brokerSession,brokerCwd:CONFIG.brokerCwd,build:CONFIG.build,observedAt:new Date(observedAt).toISOString(),ownMarkerPresent:nameMatches&&sourceMatches&&ownerMatches&&rootMatches&&registrationConfirmed,nameMatches,sourceMatches,ownerMatches,rootMatches,registrationConfirmed,previousServiceId:CONFIG.observeRetiredServiceId,previousMarkerPresent:previous===null?null:commands.some(c=>c.name===previous),modelCallsRequested:0})+'\n')
   }catch{} // Absence is not inventory or unload qualification.
  })
 }catch{}
 return next(event)
}
async function runServiceMarker($,event,next){
 return {text:'Owned native service lifecycle marker; no read or model requested.'}
}
