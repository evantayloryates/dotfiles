import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync,readdirSync,symlinkSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {reportInbox} from '../lib/report-inbox.mjs'
import {sampleBroker,detectorTransition,publishDetectorEvent,easternStamp} from '../lib/broker-detector.mjs'
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'claude-detector-')),brokerDir=join(root,'broker'),peerDir=join(root,'peers'),recordFile=join(root,'owned-record.json'),sessionId='local_00000000-0000-4000-8000-000000000001',now=1791348600000
 for(const folder of [brokerDir,peerDir,join(brokerDir,'requests'),join(brokerDir,'controls')])mkdirSync(folder,{recursive:true})
 const write=(file,value)=>writeFileSync(file,JSON.stringify(value),{mode:0o600})
 write(join(brokerDir,'broker.json'),{sessionId})
 const record={sessionId,cliSessionId:sessionId.slice(6),cwd:brokerDir,title:'claude-driver-broker',isArchived:false,permissionMode:'bypassPermissions'}
 write(recordFile,record)
 const peer={pid:42,hostSessionId:sessionId,sessionId:sessionId.slice(6),procStart:'owned-epoch',entrypoint:'claude-desktop',version:'2.1.289',status:'idle'}
 write(join(peerDir,'42.json'),peer)
 const options={brokerDir,peerDir,recordFile,now,isAlive:()=>true,procStart:()=>peer.procStart}
 return {root,brokerDir,peerDir,recordFile,record,peer,options,write,close:()=>rmSync(root,{recursive:true,force:true})}
}
test('healthy idle sensing emits no inference event or report',()=>{
 const f=fixture();try{const sample=sampleBroker(f.options);assert.equal(sample.state,'live');assert.equal(detectorTransition(null,sample),null);assert.equal(detectorTransition({...sample,at:sample.at-30000},sample),null)}finally{f.close()}
})
test('intentional STOP suppresses a would-be offline or queued-work alert',()=>{
 const f=fixture();try{writeFileSync(join(f.brokerDir,'STOP'),'owned deployment stop');const sample=sampleBroker({...f.options,isAlive:()=>false});assert.equal(sample.state,'intentional-stop');assert.equal(detectorTransition({state:'offline'},sample),null)}finally{f.close()}
})
test('native liveness uses epoch and refuses duplicate processes or unavailable evidence',()=>{
 const f=fixture();try{
  assert.equal(sampleBroker({...f.options,isAlive:()=>false}).state,'offline')
  assert.equal(sampleBroker({...f.options,isAlive:()=>null}).state,'observation-unavailable')
  assert.equal(sampleBroker({...f.options,procStart:()=>null}).state,'observation-unavailable')
  assert.equal(sampleBroker({...f.options,procStart:()=> 'reused-pid'}).state,'offline')
  f.write(join(f.peerDir,'43.json'),{...f.peer,pid:43});assert.equal(sampleBroker(f.options).reason,'multiple-live-native-processes')
 }finally{f.close()}
})
test('changed approved identity is diagnostic evidence, never a recovery instruction',()=>{
 const f=fixture();try{for(const change of [{cwd:'/other'},{title:'user chat'},{permissionMode:'acceptEdits'},{isArchived:true}]){f.write(f.recordFile,{...f.record,...change});assert.equal(sampleBroker(f.options).state,'identity-changed')}}finally{f.close()}
})
test('only current aged unclaimed work triggers an idle serving alert',()=>{
 const f=fixture();try{
  const request=join(f.brokerDir,'requests','fixture.json'),control=join(f.brokerDir,'controls','fixture.json')
  f.write(request,{id:'fixture',createdAt:new Date(f.options.now-20000).toISOString(),expiresAt:f.options.now+60000,ops:[{args:{message:'PRIVATE_SYNTHETIC_PROMPT'}}]})
  f.write(control,{state:'pending',dispatched:[]});const sample=sampleBroker(f.options);assert.equal(sample.state,'unserved-work');assert.deepEqual(sample.requestIds,['fixture']);assert.equal(JSON.stringify(sample).includes('PRIVATE_SYNTHETIC_PROMPT'),false)
  for(const c of [{state:'pending',cancelRequested:true},{state:'pending',dispatched:[0]},{state:'expired'},{state:'cancelled'},{state:'picked_up'}]){f.write(control,c);assert.equal(sampleBroker(f.options).state,'live')}
  f.write(control,{state:'pending'});assert.equal(sampleBroker({...f.options,now:f.options.now+61000}).state,'live');assert.equal(sampleBroker({...f.options,now:f.options.now-10000}).state,'live')
 }finally{f.close()}
})
test('unchanged episodes deduplicate; restored liveness and a new PID produce one event',()=>{
 const fault={state:'offline',reason:'no-live-owned-native-process',at:1},healthy={state:'live',pid:42,procStart:'owned',at:2}
 assert.equal(detectorTransition(null,fault).kind,'fault-observation');assert.equal(detectorTransition(fault,{...fault,at:30000}),null)
 assert.equal(detectorTransition(fault,healthy).kind,'liveness-returned');assert.equal(detectorTransition(healthy,healthy),null)
 assert.equal(detectorTransition(healthy,{...healthy,pid:43}).kind,'native-process-changed')
 assert.equal(detectorTransition(healthy,{...healthy,procStart:'reused-epoch'}).kind,'native-process-changed')
})
test('completed reports are atomic, unique, bounded and metadata-only, with Eastern DST naming',()=>{
 const f=fixture();try{
  const sample=sampleBroker({...f.options,isAlive:()=>false}),event=detectorTransition(null,sample),reportDir=join(f.root,'reports')
  const a=publishDetectorEvent({sample,event,reportDir,runtimeBuild:'synthetic'}),b=publishDetectorEvent({sample,event,reportDir,runtimeBuild:'synthetic'})
  assert.notEqual(a.name,b.name);assert.equal(readdirSync(reportDir).filter(x=>x.endsWith('.tmp')).length,0)
  const report=JSON.parse(readFileSync(a.file,'utf8'));assert.equal(report.inferenceCalls,0);assert.equal(report.recovery.attempted,false);assert.equal(report.observedFacts.state,'offline')
  assert.match(easternStamp(Date.parse('2026-10-07T04:00:00Z')),/-0400$/);assert.match(easternStamp(Date.parse('2026-12-07T04:00:00Z')),/-0500$/)
 }finally{f.close()}
})
test('a symlinked owned record is refused as unavailable rather than followed',()=>{
 const f=fixture();try{const target=join(f.root,'private.json');f.write(target,f.record);rmSync(f.recordFile);symlinkSync(target,f.recordFile);assert.equal(sampleBroker(f.options).state,'observation-unavailable')}finally{f.close()}
})

test('a changed event flows into the hash-scanned inbox once; review acknowledgment never authorizes recovery',()=>{
 const f=fixture();try{
  const sample=sampleBroker({...f.options,isAlive:()=>false}),event=detectorTransition(null,sample),reportDir=join(f.root,'reports'),stateFile=join(f.root,'inbox.json')
  const a=publishDetectorEvent({sample,event,reportDir,runtimeBuild:'synthetic'}),scan=reportInbox(reportDir,stateFile)
  assert.equal(scan.pending.length,1);assert.equal(scan.pending[0].name,a.name)
  assert.equal(detectorTransition(sample,{...sample,at:sample.at+30000}),null)
  assert.equal(reportInbox(reportDir,stateFile,{ack:scan.pending[0]}).pending.length,0)
  assert.equal(JSON.parse(readFileSync(a.file)).recovery.attempted,false)
  f.write(a.file,{schemaVersion:1,changed:true})
  assert.throws(()=>reportInbox(reportDir,stateFile,{ack:scan.pending[0]}),/changed/)
  const changed=reportInbox(reportDir,stateFile);assert.equal(changed.pending.length,1);assert.notEqual(changed.pending[0].sha256,scan.pending[0].sha256)
 }finally{f.close()}
})
