// Ownership classification for a qualified keeper, not physical-input or native
// release clearance. No tap is changed, removed or ignored by executable name.
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b)
const fail=reason=>Object.assign(new Error('Keeper filter audit: '+reason),{category:'input_keeper_filter_failed'})
const fields=['enabled','mask','targetPid','tapId','ownerPid','options']
const canonical=t=>Object.fromEntries(fields.map(k=>[k,t[k]]))
export function admitKeeperFilters({taps,processes,resource,targets,baselineTaps,requireTargets=false}){
 if(!Array.isArray(taps)||!Array.isArray(processes)||!Array.isArray(targets)||!Array.isArray(baselineTaps))throw fail('inventory missing')
 const helpers=processes.filter(p=>p.path.endsWith('/SkyComputerUseService'))
 if(helpers.length!==1||helpers[0].pid!==resource.pid||helpers[0].group!==resource.group)throw fail('exact singleton helper unverified')
 const baseline=new Map(baselineTaps.map(t=>[t.tapId,canonical(t)])),allowed=new Map()
 if(baseline.size!==baselineTaps.length||baselineTaps.some(t=>!taps.some(current=>current.tapId===t.tapId)))throw fail('baseline tap missing or duplicated')
 for(const target of targets){
  if(!Number.isSafeInteger(target.pid)||allowed.has(target.pid)||!['target-app','engine-auxiliary'].includes(target.role)||!processes.some(p=>p.pid===target.pid&&p.path===target.path))throw fail('target process identity changed')
  if(target.role==='engine-auxiliary'&&target.path!=='/System/Library/PrivateFrameworks/ViewBridge.framework/Versions/A/XPCServices/ViewBridgeAuxiliary.xpc/Contents/MacOS/ViewBridgeAuxiliary')throw fail('unqualified engine auxiliary')
  allowed.set(target.pid,target)
 }
 if(!targets.some(t=>t.role==='target-app'))throw fail('target application missing')
 const owned=[],seen=new Set()
 for(const tap of taps){
  if(!Number.isSafeInteger(tap.tapId)||!Number.isSafeInteger(tap.ownerPid)||!Number.isSafeInteger(tap.targetPid)||typeof tap.enabled!=='boolean'||!Number.isSafeInteger(tap.options)||!/^\d+$/.test(tap.mask))throw fail('malformed tap')
  if(seen.has(tap.tapId))throw fail('duplicate tap identity');seen.add(tap.tapId)
  if(baseline.has(tap.tapId)){
   if(!same(canonical(tap),baseline.get(tap.tapId)))throw fail('baseline tap changed')
   continue
  }
  if(tap.enabled&&tap.options===0&&(BigInt(tap.mask)&7168n)!==0n){
   if(tap.ownerPid!==resource.pid||tap.mask!=='7168'||!allowed.has(tap.targetPid))throw fail('foreign or unexplained keyboard filter')
   if(owned.some(t=>t.targetPid===tap.targetPid))throw fail('duplicate retained target filter')
   owned.push(canonical(tap))
  }
 }
 if(requireTargets&&targets.some(t=>!owned.some(f=>f.targetPid===t.pid)))throw fail('expected retained target filter missing')
 return {scope:'exact-owned-retained-keeper-filters',nativeInputReleaseAssessed:false,physicalInputSafetyAssessed:false,helperPid:resource.pid,filters:owned,targets:targets.map(t=>({pid:t.pid,path:t.path,role:t.role}))}
}
