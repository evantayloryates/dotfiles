  const controlText=await $.fs.read(CONFIG.brokerCwd+'/controls/'+requestId+'.json')
  if(typeof controlText!=='string'||controlText.length>4096)return {consumed:'service-read-control-refused'}
  const controlAt=await $.clock.now()
  if(!Number.isFinite(controlAt)||controlAt<dispatchAt||controlAt>CONFIG.deadline)return {consumed:'service-read-expired'}
  let control;try{control=JSON.parse(controlText)}catch{return {consumed:'service-read-control-refused'}}
  if(control?.id!==requestId||!Array.isArray(control.dispatched)||control.dispatched.length!==1||control.dispatched[0]!==0||!Number.isFinite(control.at)||control.at>controlAt)return {consumed:'service-read-control-refused'}
  if(control.cancelRequested===true){
   const file=CONFIG.brokerCwd+'/.native-service-'+requestId+'.cancel.json'
   if(!await $.fs.exists(file))await $.fs.write(file,JSON.stringify({schemaVersion:1,scope:'owned-native-service-cancel-before-call',serviceId:CONFIG.id,requestId,brokerSession:CONFIG.brokerSession,observedAt:new Date(controlAt).toISOString(),nativeMcpCallsRequested:0,modelCallsRequested:0})+'\n')
   return {consumed:'service-read-cancelled-before-call'}
  }
  if(control.state!=='dispatched'||control.cancelRequested!==undefined&&control.cancelRequested!==false)return {consumed:'service-read-control-refused'}
