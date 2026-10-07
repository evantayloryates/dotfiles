  // Optional disposal fixture. One durable attempt, no retries after uncertainty.
  const resourceIntent=CONFIG.brokerCwd+'/.native-service-resource-'+CONFIG.id+'.intent.json'
  if(!await $.fs.exists(resourceIntent)){
   await $.fs.write(resourceIntent,JSON.stringify({schemaVersion:1,serviceId:CONFIG.id,attemptedAt:new Date(now).toISOString(),selfDeadline:CONFIG.deadline+30000,modelCallsRequested:0})+'\n')
   $.clock.after(250,async()=>{
    try{
     const time=await $.clock.now(),owner=await $.session.id(),cwd=await $.session.cwd()
     if(time<CONFIG.notBefore||time>CONFIG.deadline||(owner!==CONFIG.brokerSession&&owner!==CONFIG.brokerSession.slice(6))||cwd!==CONFIG.brokerCwd)return
     for await(const piece of $.process.spawn({argv:['/opt/homebrew/bin/node','--input-type=module','-e',RESOURCE_PROGRAM],cwd:CONFIG.brokerCwd})){
      // Drain only. Child output is fixed; native stream lifetime owns the child.
     }
    }catch{} // Missing disposition stays unqualified; child independently expires.
   })
  }
