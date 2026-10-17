// Called only after native receipt verification. This extracts bounded metadata;
// arbitrary error text never grants trust, retry or dispatch authority.
export function nativeDeliveryFailure(result,target){
 if(result?.ok!==false||typeof result.error!=='string'||result.error.length>4096||!/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(target||''))return undefined
 const error=result.error,delivery=error.match(/\(delivery: undelivered; message_id: ([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})\)$/)
 if(!delivery||!error.startsWith('Message not delivered to session '+target+' ('))return undefined
 if(!error.endsWith('): "Workspace requires trust approval before starting a session.". (delivery: undelivered; message_id: '+delivery[1]+')'))return undefined
 return {category:'workspace_trust_required',delivery:'undelivered',messageId:delivery[1],humanActionRequired:true,retrySafe:false}
}
