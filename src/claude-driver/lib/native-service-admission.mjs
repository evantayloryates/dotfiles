import {screenNativeServiceReady} from './native-peer-service-evidence.mjs'
// Pure host preflight. Publishing, claiming and delivery require a caller-held
// broker lock and a fresh check immediately before each irreversible boundary.
export function admitNativeServiceRead({config,epoch,ready,broker,versions,baseline,currentBaseline,hashes,installedHashes,controls,targetSession,now,timeoutMs=20000}={}){
 const checks={
  target:typeof targetSession==='string'&&/^local_[a-f0-9-]{36}$/.test(targetSession)&&targetSession!==config?.brokerSession,
  clock:Number.isSafeInteger(now)&&Number.isInteger(timeoutMs)&&timeoutMs>=1000&&timeoutMs<=60000,
  readiness:screenNativeServiceReady({config,ready,now}),
  epoch:broker?.sessionId===config?.brokerSession&&Number.isInteger(epoch?.pid)&&epoch.pid>0&&typeof epoch.procStart==='string'&&broker?.live?.pid===epoch.pid&&broker.live.procStart===epoch.procStart&&broker.live.entrypoint==='claude-desktop'&&broker.live.status==='idle',
  runtime:typeof config?.build==='string'&&config.build===epoch?.build&&broker?.runtime?.build===config.build&&broker.runtime.pinned===true&&broker.runtime.integrity===true,
  versions:versions?.app==='2.26454.0'&&versions?.cli==='2.1.289',
  controls:controls?.stopped===false&&controls?.armed===false&&controls?.diagnostic===false,
  baseline:baseline&&Object.keys(baseline).sort().join(',')==='.claude/settings.json,stop-rescue-policy.json'&&Object.entries(baseline).every(([p,h])=>typeof h==='string'&&/^[a-f0-9]{64}$/.test(h)&&currentBaseline?.[p]===h),
  bytes:hashes&&Object.keys(hashes).sort().join(',')==='.claude-plugin/plugin.json,hooks/hooks.json,hooks/register.js'&&Object.entries(hashes).every(([p,h])=>typeof h==='string'&&/^[a-f0-9]{64}$/.test(h)&&installedHashes?.[p]===h)
 }
 if(!Object.values(checks).every(x=>x===true))return {admitted:false,checks,retrySafe:true,releaseAuthorized:false}
 const expiresAt=Math.min(now+timeoutMs,config.deadline)
 if(expiresAt-now<1000)return {admitted:false,checks,reason:'service_window_short',retrySafe:true,releaseAuthorized:false}
 return {admitted:true,expiresAt,op:'get_session',args:{session_id:targetSession},releaseAuthorized:false}
}
