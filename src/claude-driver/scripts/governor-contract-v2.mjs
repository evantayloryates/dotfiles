// Execute selected installed governor functions in an isolated VM on synthetic
// sessions. No app IPC, app mutations, OS pressure, timers or user sessions.
import {openSync,readSync,closeSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {runInNewContext} from 'node:vm'
import assert from 'node:assert/strict'
const {appVersion}=await import(new URL('../lib/paths.mjs',import.meta.url))
const {STATE_DIR,writeJsonAtomic}=await import(new URL('../lib/state.mjs',import.meta.url))
const {recordMemory}=await import(new URL('../lib/memory.mjs',import.meta.url))
const {join}=await import('node:path')
const asar='/Applications/Claude.app/Contents/Resources/app.asar'
const report=join(STATE_DIR,'pressure','governor-contract-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json')
let source,stage='archive'
try {
const fd=openSync(asar,'r')
try{
 const prefix=Buffer.alloc(16);readSync(fd,prefix,0,16,0)
 const size=prefix.readUInt32LE(4),jsonSize=prefix.readUInt32LE(12)
 assert.ok(jsonSize>0&&jsonSize<32*1024*1024&&size>=jsonSize+8)
 const header=Buffer.alloc(jsonSize);readSync(fd,header,0,jsonSize,16)
 const build=JSON.parse(header).files['.vite'].files.build.files
 const entries=Object.entries(build).filter(([name,e])=>/^index\.chunk-.*\.js$/.test(name)&&!e.unpacked&&e.size<8*1024*1024)
 for(const [name,e] of entries){
  const buf=Buffer.alloc(e.size);readSync(fd,buf,0,e.size,8+size+Number(e.offset));const text=buf.toString('utf8')
  if(text.includes('peekLruIdleVictim:e=>{')&&text.includes('onPressure(e){')){source={name,text};break}
 }
}finally{closeSync(fd)}
assert.ok(source,'installed native governor source not found')
const cut=(start,end)=>{const i=source.text.indexOf(start),j=source.text.indexOf(end,i+start.length);assert.ok(i>=0&&j>i,'native source schema changed');return source.text.slice(i,j)}
const peek=cut('peekLruIdleVictim:e=>{',',getFreeMemoryRatio:').slice('peekLruIdleVictim:'.length)
const pressure=cut('onPressure(e){','onSignal(e){')
const eviction=cut('evictionOn(){','currentLevel(){').replace('}passesIdleGuard','},passesIdleGuard')
const liveCron=cut('hasLiveCronJobs(e,t){','isCronJobGone(e,n){')
stage='adapter'
const current=pressure.includes('t.q0.info(')&&liveCron.includes('this.sessionViewRecord.evictExpiredCronJobs(')
const legacy=pressure.includes('t.KQ.info(')&&!liveCron.includes('this.sessionViewRecord.')
assert.ok(current||legacy,'unsupported installed governor schema')
const constants={}
for(const name of current?['of','af','sf','cf','rf']:['Tf','wf','Cf']){const m=source.text.match(new RegExp('\\b'+name+'=([0-9]+(?:e[0-9]+)?)[,;]'));assert.ok(m,'native numeric constant missing: '+name);constants[name]=Number(m[1])}
stage='scenarios'
const rows=[]
const scenario=(name,cron,busy=false,allProtected=false)=>{
 const body=`(()=>{
 const items=Array.from({length:6},(_,i)=>({sessionId:i===0?'synthetic-broker':'synthetic-'+i,query:true,backend:{countsTowardLocalProcessCap:()=>true},isRunning:i===0&&busy,isStopping:false,activeCronJobs:new Map((i===0&&cron||allProtected)?[['owned-job',{}]]:[]),idleSince:now-1200000+i*1000}));
 const removed=[];const owner={held:id=>items.find(x=>x.sessionId===id&&!removed.includes(id)),warmLifecycle:{getLruIdleCandidate:pred=>items.filter(x=>!removed.includes(x.sessionId)).find(x=>pred(x.sessionId))?.sessionId,getState:id=>items.find(x=>x.sessionId===id)},hasAgentRunInProgress:()=>false,hasLiveLoopWakeup:()=>false,evictExpiredCronJobs:()=>[],sessionViewRecord:{evictExpiredCronJobs:()=>[]},${liveCron},cliGovernor:{isOverCap:()=>false},deviceSessionYieldsToGovernor:()=>false};
 const pick=(function(){return (${peek})}).call(owner);
 const governor={cfg:{cap:()=>6,countActive:()=>6-removed.length,peekLruIdleVictim:pick,evictVictim:id=>removed.push(id)},inFlight:0,lastSweepAt:{warning:0,critical:0},lastEmitted:null,${eviction},${pressure}};
 governor.onPressure('warning');const first=removed.slice();governor.onPressure('warning');return {removed:first,afterRepeatedSignal:removed.slice()};
})()`
 const output=runInNewContext(body,{now:1791340000000,cron,busy,allProtected,...constants,Date:{now:()=>1791340000000},t:{KQ:{info:()=>{},warn:()=>{}},EG:64,WS:()=>false,q0:{info:()=>{},warn:()=>{}},pY:64,mC:()=>false,$l:()=>0,Ql:()=>0},n:{ir:r=>r.idleSince,Or:r=>r.idleSince},uy:()=>false,uk:()=>false,py:()=>false,sA:()=>false,YI:()=>false},{timeout:1000,contextCodeGeneration:{strings:false,wasm:false}})
 assert.equal(output.removed.includes('synthetic-broker'),!cron&&!busy&&!allProtected)
 assert.equal(output.removed.length,allProtected?0:2)
 assert.equal(JSON.stringify(output.removed),JSON.stringify(output.afterRepeatedSignal),'pressure debounce must prevent another sweep')
 rows.push({name,ok:true,evicted:output.removed.length,brokerEvicted:output.removed.includes('synthetic-broker')})
}
scenario('owned native cron excludes idle broker while other synthetic idle sessions are evicted',true)
scenario('unprotected oldest idle broker is an eviction candidate',false)
scenario('busy broker is independently excluded',false,true)
scenario('all protected candidates cause no eviction',true,false,true)
writeJsonAtomic(report,{scope:'installed-native-governor-isolated',ok:true,versions:{app:appVersion()},source:{archive:asar,module:source.name,sha256:createHash('sha256').update(source.text).digest('hex')},constants,rows,limitations:['Synthetic held-session and expired-job dependencies','No real OS/native pressure emitted','Does not qualify end-to-end native eviction survival']})
recordMemory({kind:'test_result',topic:'broker-governor-contract',source:'native-source-isolated',status:'passed',evidence:report,lesson:'Installed native pressure and victim-selection functions, isolated VM: protected broker excluded, unprotected broker evicted, busy excluded, all protected no eviction and debounce verified. Synthetic dependencies; not live OS pressure.'})
console.log(JSON.stringify({report,ok:true,checks:rows.length,nativePressure:false,nativeWrites:false}))

} catch(error) {
 const failure={scope:'installed-native-governor-isolated',ok:false,versions:{app:appVersion()},stage,source:source?{module:source.name,sha256:createHash('sha256').update(source.text).digest('hex')}:null,error:{name:error.name,message:error.message.slice(0,240)},nativePressure:false,nativeWrites:false}
 writeJsonAtomic(report,failure)
 recordMemory({kind:'test_result',topic:'broker-governor-contract',source:'native-source-isolated',status:'failed',evidence:report,lesson:'Installed-source extraction or isolated assertion failed; does not establish governor protection.'})
 console.log(JSON.stringify({report,...failure}));process.exitCode=1
}
