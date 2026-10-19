// Pure metadata screening. Process records alone never prove native disposal.
export function screenNativeResourceEvidence({config,intent,ready,exit=null,now}={}){
 const refused={valid:false,resourceDisposalQualified:false}
 try{
  if(config.resourceProbe!==true||config.marker!==true||!Number.isFinite(now))return refused
  if(Object.keys(intent).sort().join(',')!==['schemaVersion','serviceId','attemptedAt','selfDeadline','modelCallsRequested'].sort().join(',')||intent.schemaVersion!==1||intent.serviceId!==config.id||intent.selfDeadline!==config.deadline+30000||intent.modelCallsRequested!==0)return refused
  const attempted=Date.parse(intent.attemptedAt),started=Date.parse(ready.startedAt)
  const keys=['schemaVersion','scope','serviceId','pid','ppid','startedAt','selfDeadline']
  const identity=r=>r.schemaVersion===1&&r.scope==='owned-native-resource'&&r.serviceId===config.id&&Number.isSafeInteger(r.pid)&&r.pid>1&&Number.isSafeInteger(r.ppid)&&r.ppid>1&&r.selfDeadline===intent.selfDeadline
  if(Object.keys(ready).sort().join(',')!==keys.sort().join(',')||!identity(ready)||!Number.isFinite(attempted)||!Number.isFinite(started)||new Date(attempted).toISOString()!==intent.attemptedAt||new Date(started).toISOString()!==ready.startedAt||attempted<config.notBefore||attempted>config.deadline||started<attempted||started>config.deadline||started>now)return refused
  if(exit===null)return {valid:true,exitObserved:false,resourceDisposalQualified:false}
  if(Object.keys(exit).sort().join(',')!==[...keys,'reason','code','exitedAt'].sort().join(',')||!identity(exit)||keys.some(k=>exit[k]!==ready[k]))return refused
  const ended=Date.parse(exit.exitedAt),codes={SIGTERM:143,SIGINT:130,deadline:0}
  if(!Object.hasOwn(codes,exit.reason)||exit.code!==codes[exit.reason]||!Number.isFinite(ended)||new Date(ended).toISOString()!==exit.exitedAt||ended<started||ended>now||exit.reason==='deadline'&&ended<intent.selfDeadline)return refused
  return {valid:true,exitObserved:true,reason:exit.reason,endedBeforeDeadline:ended<intent.selfDeadline,resourceDisposalQualified:false}
 }catch{return refused}
}
