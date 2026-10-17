// Shared helper/native boundary contract. This checks request ownership, not
// retirement, authorization, or whether an earlier effect actually happened.
export function nativeRequestBindingMatches(request,pointer){
 const binding=request?.nativeRuntimeBinding,version=pointer?.nativeRequestBindingVersion
 if(version===undefined&&binding===undefined)return true // legacy, no fencing claim
 if(version!==1||binding?.version!==1)return false
 if(!/^[a-f0-9]{64}$/.test(pointer.build)||!/^[a-f0-9]{64}$/.test(pointer.bootstrapHash)||!Number.isSafeInteger(pointer.generation)||pointer.generation<1||!Number.isSafeInteger(pointer.pid)||pointer.pid<=0||typeof pointer.procStart!=='string'||!pointer.procStart||!/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(pointer.sessionId))return false
 return ['build','bootstrapHash','generation','sessionId','pid','procStart'].every(k=>binding[k]===pointer[k])
}

// Policy bytes are independently integrity-checked by stopRescuePolicy. A new
// release also needs its own binding-aware handler in the exact live epoch.
export function nativeRequestPolicyMatches(info,policy){
 const version=info?.runtime?.nativeRequestBindingVersion
 if(version===undefined||version===null)return true // legacy, no fencing claim
 return version===1&&policy?.nativeRequestBindingVersion===1&&policy.nativeEffectAdmissionVersion===1&&policy.build===info.runtime.build&&policy.sessionId===info.sessionId&&policy.pid===info.live?.pid&&policy.procStart===info.live?.procStart
}
