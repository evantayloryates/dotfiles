// Requirements describe a selected route, not a tool's read/write label.
export const HEALTH_TYPES=Object.freeze(['local','desktop','native-sidecar','inference'])
export function assessActionHealth(type,{appRunning,processAlive,runtimeIntegrity,servingChannel,inference}={}){
 if(!HEALTH_TYPES.includes(type))throw Error('unknown action health type')
 const requirements=type==='local'?[]:type==='desktop'?['app']:type==='native-sidecar'?['app','broker','runtime','serving']:['app','inference']
 const values={app:appRunning,broker:processAlive,runtime:runtimeIntegrity,serving:servingChannel==='observed'?true:undefined,inference:inference==='available'?true:inference==='quota-exhausted'?false:undefined}
 const unavailable=requirements.filter(k=>values[k]===false),unknown=requirements.filter(k=>values[k]!==true&&values[k]!==false)
 return {type,requirements,eligible:!unavailable.length&&!unknown.length,unavailable,unknown,authorizationAssessed:false,executionVerified:false,modelCallsRequested:0}
}
