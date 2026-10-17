// Shared helper/native boundary contract. This checks request ownership, not
// retirement, authorization, or whether an earlier effect actually happened.
export function nativeRequestBindingMatches(request,pointer){
 const binding=request?.nativeRuntimeBinding,version=pointer?.nativeRequestBindingVersion
 if(version===undefined&&binding===undefined)return true // legacy, no fencing claim
 if(version!==1||binding?.version!==1)return false
 if(!/^[a-f0-9]{64}$/.test(pointer.build)||!/^[a-f0-9]{64}$/.test(pointer.bootstrapHash)||!Number.isSafeInteger(pointer.generation)||pointer.generation<1||!Number.isSafeInteger(pointer.pid)||pointer.pid<=0||typeof pointer.procStart!=='string'||!pointer.procStart||!/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(pointer.sessionId))return false
 return ['build','bootstrapHash','generation','sessionId','pid','procStart'].every(k=>binding[k]===pointer[k])
}
