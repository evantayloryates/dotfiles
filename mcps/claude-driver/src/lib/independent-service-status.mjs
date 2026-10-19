// Metadata only. Budget reservation is not native serving or unload evidence.
export function summarizeIndependentBudget(config,slots){
 if(!Number.isInteger(config?.maxRequests)||config.maxRequests<1||config.maxRequests>128||!Array.isArray(slots)||slots.length!==config.maxRequests)throw Error('invalid service budget')
 const reserved=[]
 for(let slot=0;slot<slots.length;slot++){
  const row=slots[slot];if(row===null)continue
  if(!row||Object.keys(row).sort().join(',')!=='maxRequests,requestId,schemaVersion,serviceId,slot'||row.schemaVersion!==1||row.serviceId!==config.id||row.slot!==slot||row.maxRequests!==config.maxRequests||!/^rpeer[a-f0-9]{32}$/.test(row.requestId)||reserved.includes(row.requestId))throw Error('invalid service reservation')
  reserved.push(row.requestId)
 }
 return {configuredMaxRequests:config.maxRequests,reservedSlots:reserved.length,unreservedSlots:config.maxRequests-reserved.length,reservedRequestIds:reserved}
}

// A checkpoint records intention/progress, not whether its effect happened.
export function summarizeIndependentActivationLedger(ledger,{serviceId,session}){
 if(ledger===null)return {activationPhaseObserved:null,activationEffectsAssessed:false}
 const phases=['created','installed',...['policy','pointer','settings','publish'].flatMap(p=>['before-'+p,'after-'+p])]
 if(!ledger||ledger.schemaVersion!==1||ledger.kind!=='independent-service-activation'||ledger.serviceId!==serviceId||ledger.sessionId!==session||!phases.includes(ledger.phase)||!Number.isSafeInteger(ledger.at)||ledger.at<0||! /^[a-f0-9]{64}$/.test(ledger.build)||ledger.servingQualified!==false||ledger.scopedUnloadQualified!==false)throw Error('activation checkpoint unqualified')
 return {activationPhaseObserved:ledger.phase,activationEffectsAssessed:false}
}
