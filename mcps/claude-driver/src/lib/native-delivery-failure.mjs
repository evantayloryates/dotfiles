// Called only after native receipt verification. This extracts bounded metadata;
// arbitrary error text never grants trust, retry or dispatch authority.
export function nativeDeliveryFailure(result,target){
 if(result?.ok!==false||typeof result.error!=='string'||result.error.length>4096||!/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(target||''))return undefined
 const error=result.error,delivery=error.match(/\(delivery: undelivered; message_id: ([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})\)$/)
 if(!delivery||!error.startsWith('Message not delivered to session '+target+' ('))return undefined
 if(!error.endsWith('): "Workspace requires trust approval before starting a session.". (delivery: undelivered; message_id: '+delivery[1]+')'))return undefined
 return {category:'workspace_trust_required',delivery:'undelivered',messageId:delivery[1],humanActionRequired:true,retrySafe:false}
}

// Recovery guidance is metadata for a person, never permission to replay the
// original message. Use the exact target record already bound by the host route.
export function nativeTrustRecoveryAction(failure,record,target){
 if(failure?.category!=='workspace_trust_required'||failure.delivery!=='undelivered'||failure.humanActionRequired!==true||failure.retrySafe!==false||!/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(target||'')||record?.sessionId!==target||typeof record.cwd!=='string'||!record.cwd.startsWith('/')||record.cwd.length>4096||/[\0\r\n]/.test(record.cwd)||typeof record.title!=='string'||!record.title.trim()||record.title.length>200||/[\0\r\n]/.test(record.title))return undefined
 return {kind:'native-workspace-trust',app:'Claude Desktop',view:'Code',sessionId:target,title:record.title,workspace:record.cwd,steps:['Open the existing session','Send ready','Approve workspace trust for this folder'],personRequired:true,replayOriginalRequest:false,servingReadinessAssessed:false}
}
