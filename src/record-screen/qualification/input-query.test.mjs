import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,writeFile,readFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import {queryRecordingInput,validateInputQuery,inputQueryHealth} from '../lib/input-query.mjs';
const id='rec_syntheticInput',epoch='900719925474099312345';
const action='act_11111111-1111-1111-1111-111111111111',other='act_22222222-2222-2222-2222-222222222222';
const header={kind:'header',schema:'record-screen-source/v1',recording_id:id,clock_domain:'CLOCK_UPTIME_RAW',epoch_host_ns:epoch};
const footer={kind:'footer',schema:header.schema,epoch_host_ns:epoch,complete:true,rows_lost:0};
const event=(ns,overrides={})=>({kind:'input_event',received_host_ns:String(BigInt(epoch)+BigInt(ns)),relative_ns:String(ns),event_timestamp_ns:'123',type:10,key_code:8,autorepeat:false,flags:'0',source_pid:20,destination_pid:100,source_tag:'0',window_under_pointer:20,scope_certainty:'app_delivery_window_unresolved',relevance_reasons:['destination_app'],action_ids:[action],secure_input_snapshot:false,literal_text:'MUST NEVER RETURN',...overrides});
const request={recording_id:id,from_relative_ns:'0',to_relative_ns:'50'};
const contextRow=(start,end,overrides={})=>({kind:'action_scope',relative_ns:String(end??start),action:{schema:'record-screen-action/v1',clock_domain:'CLOCK_UPTIME_RAW',action_token:action,
 action_id:'open-preview',session_id:'ses_fixture',caller:'owned-fixture',provider:'native-CUA',intent:'Open verified synthetic file preview',
 target:{bundle_id:'com.apple.finder',pid:100,window_id:20},context:{purpose:'Capture menu lifecycle',before_state:'Exact synthetic file selected',expected_change:'Quick Look visible',verification_plan:'Inspect filename and source pixels',literal_text:'MUST NEVER RETURN'},
 state:end===null?'active':'closed',result:end===null?'unknown':'delivered',start_ns:String(BigInt(epoch)+BigInt(start)),end_ns:end===null?null:String(BigInt(epoch)+BigInt(end)),deadline_ns:String(BigInt(epoch)+100n),evidence_refs:['/tmp/owned-proof.json'],...overrides}});
async function fixture(t,rows){const root=await mkdtemp(join(tmpdir(),'input-query-'));t.after(()=>rm(root,{recursive:true,force:true}));const path=join(root,'source.jsonl');await writeFile(path,rows.map(r=>JSON.stringify(r)).join('\n')+'\n');return{root,path,descriptor:{recording_id:id,state:'done',source_packet:{path,epoch_host_ns:epoch,complete:true}}}}

test('exact receipt intervals preserve broad same-app candidates, generation uncertainty and safe fields',async t=>{
 const f=await fixture(t,[header,event(-1),event(0),event(49,{type:12,key_code:55,action_ids:[]}),event(50),footer]);
 const result=await queryRecordingInput(f.descriptor,request);
 assert.deepEqual(result.events.map(e=>e.relative_ns),['0','49']);assert.equal(result.selection.total_retained_events,4);assert.equal(result.coverage.journal_complete,true);
 assert.equal(result.events[0].received_host_ns,epoch);assert.equal(result.events[0].event_timestamp_ns,'123');assert.equal(result.events[0].scope_certainty,'app_delivery_window_unresolved');assert.equal(result.events[0].ownership,'unknown');
 assert.match(result.events[0].action_association,/same-app unrelated/);assert.doesNotMatch(JSON.stringify(result),/MUST NEVER RETURN|literal_text/);
 assert.equal(result.coverage.input_delivery_completeness,'unproven');assert.equal(result.coverage.video_coverage_evaluated,false);assert.equal(result.next_cursor,null);
});
test('metadata filters preserve gap evidence and make unassociated/default selection explicit',async t=>{
 const scroll=event(30,{type:22,raw_position:{x:-50,y:120},delta:[0,1],scroll:{x:0,y:20,phase:1,momentum_phase:0,continuous:true},action_ids:[],position_for_composition:{x:999,y:999}});
 const f=await fixture(t,[header,event(0),event(10,{action_ids:[other]}),event(20,{action_ids:[]}),scroll,{kind:'input_gap',reason:'queue_overflow',host_ns:String(BigInt(epoch)+40n),relative_ns:'40',events_skipped:12},{kind:'input_gap',reason:'unavailable'},footer]);
 const broad=await queryRecordingInput(f.descriptor,{...request,action_tokens:[action]});assert.deepEqual(broad.events.map(e=>e.relative_ns),['0','20','30']);assert.equal(broad.selection.action_filtered,1);
 const narrow=await queryRecordingInput(f.descriptor,{...request,action_tokens:[action],include_unassociated:false,event_types:[22]});assert.equal(narrow.events.length,0);assert.equal(narrow.selection.type_filtered,3);assert.equal(narrow.selection.action_filtered,1);assert.equal(narrow.coverage.gaps.length,2);assert.equal(narrow.coverage.gaps_with_unknown_time,1);
 const pointer=await queryRecordingInput(f.descriptor,{...request,event_types:[22]});assert.deepEqual(pointer.events[0].raw_position,{x:-50,y:120});assert.equal(pointer.events[0].position_for_composition,null);assert.equal(pointer.events[0].scroll.momentum_phase,0);
});

test('rich captured snapshots use exact scope bounds, preserve active/unknown ends and do not become verification',async t=>{
 const active=contextRow(-5,null),closed=contextRow(-5,75),edge=contextRow(50,60,{action_token:other});
 const f=await fixture(t,[header,active,event(10),closed,edge,footer]);
 const out=await queryRecordingInput(f.descriptor,{...request,include_context:true,event_types:[22]});
 assert.equal(out.events.length,0);assert.equal(out.captured_context.updates.length,2);
 const [a,c]=out.captured_context.updates;assert.equal(a.start_relative_ns,'-5');assert.equal(a.end_relative_ns,null);assert.equal(a.overlap_basis,'declared_deadline_only');
 assert.equal(c.end_relative_ns,'75');assert.equal(c.update_relative_ns,'75');assert.equal(c.overlap_basis,'recorded_scope_bounds');
 assert.equal(c.context.expected_change,'Quick Look visible');assert.equal(c.claimed_result,'delivered');assert.equal(c.verification,'unverified_claim');assert.equal(c.ownership,'unknown');
 assert.doesNotMatch(JSON.stringify(out),/MUST NEVER RETURN|literal_text/);
 const legacy=await queryRecordingInput(f.descriptor,request);assert.equal(legacy.captured_context,undefined);
 assert.equal(out.coverage.video_coverage_evaluated,false);
});
test('health context retains pre-epoch protection without making it continuous state or borrowing later observations',async t=>{
 const pointer=ns=>event(ns,{type:1,raw_position:{x:20,y:30},secure_input_snapshot:true});
 const f=await fixture(t,[header,
  {kind:'input_listener',state:'listening',host_ns:String(BigInt(epoch)-10n),relative_ns:'-10',literal_text:'MUST NEVER RETURN'},
  {kind:'input_gap',reason:'secure_input_enabled',host_ns:String(BigInt(epoch)-5n),relative_ns:'-5'},
  pointer(1),{kind:'input_gap',reason:'secure_input_ended',host_ns:String(BigInt(epoch)+25n),relative_ns:'25'},
  event(30),{kind:'input_listener',state:'access_revoked',host_ns:String(BigInt(epoch)+50n),relative_ns:'50'},
  {kind:'input_gap',reason:'unknown_frontier'},footer]);
 const out=await queryRecordingInput(f.descriptor,{...request,include_health_context:true,event_types:[22]});
 assert.equal(out.events.length,0);const h=out.input_health_context;
 assert.deepEqual(h.counts,{preceding:2,in_interval:1,unknown_time:1,after_interval:1});
 assert.equal(h.latest_timed_protection_notification_before_interval.reason,'secure_input_enabled');assert.equal(h.latest_timed_protection_notification_before_interval.relative_ns,'-5');
 assert.equal(h.latest_timed_listener_notification_before_interval.state,'listening');assert.equal(h.interval_notifications[0].reason,'secure_input_ended');
 assert.deepEqual(h.retained_event_protection_snapshots_in_interval,{protected:1,unprotected:1,unknown:0});
 assert.doesNotMatch(JSON.stringify(h),/access_revoked|MUST NEVER RETURN|literal_text/);assert.match(h.qualification,/not continuous state/);
 const later=await queryRecordingInput(f.descriptor,{...request,from_relative_ns:'25',to_relative_ns:'51',include_health_context:true});
 assert.equal(later.input_health_context.latest_timed_protection_notification_before_interval.reason,'secure_input_enabled');assert.equal(later.input_health_context.interval_notifications[0].relative_ns,'25');
});
test('bounded health summary repeats on filtered pages, retains latest timed precedence and does not redefine old cursors',async t=>{
 const before=Array.from({length:18},(_,i)=>({kind:'input_gap',reason:i===17?'secure_input_enabled':'queue_overflow',relative_ns:String(i-20)}));
 const during=Array.from({length:34},(_,i)=>({kind:'input_listener',state:'listening',relative_ns:String(i)}));
 const untimed=Array.from({length:18},()=>({kind:'input_gap',reason:'unknown'}));
 const f=await fixture(t,[header,...before,{kind:'input_gap',reason:'secure_input_ended',relative_ns:'-10'},...during,...untimed,event(10),event(20),footer]);
 const query={...request,limit:1,include_health_context:true};const a=await queryRecordingInput(f.descriptor,query),b=await queryRecordingInput(f.descriptor,{...query,cursor:a.next_cursor});
 assert.deepEqual(a.input_health_context,b.input_health_context);const h=a.input_health_context;
 assert.deepEqual(h.counts,{preceding:19,in_interval:34,unknown_time:18,after_interval:0});assert.deepEqual(h.truncated,{preceding:true,in_interval:true,unknown_time:true});
 assert.deepEqual([h.preceding_notifications.length,h.interval_notifications.length,h.unknown_time_notifications.length],[16,32,16]);
 assert.equal(h.latest_timed_protection_notification_before_interval.reason,'secure_input_enabled');
 await assert.rejects(()=>queryRecordingInput(f.descriptor,{...query,include_health_context:false,cursor:a.next_cursor}),/different query/);
 const original=await queryRecordingInput(f.descriptor,{...request,limit:1}),omitted=await queryRecordingInput(f.descriptor,{...request,limit:1,include_health_context:false});assert.deepEqual(original,omitted);assert.equal(original.input_health_context,undefined);
 const filtered=await queryRecordingInput(f.descriptor,{...query,action_tokens:[other],include_unassociated:false});assert.equal(filtered.events.length,0);assert.deepEqual(filtered.input_health_context,h);
});
test('missing health observations and partial journals stay unknown; malformed optional health refuses safely',async t=>{
 const f=await fixture(t,[header,event(1,{secure_input_snapshot:undefined})]);f.descriptor.state='interrupted';f.descriptor.source_packet.complete=false;
 const r=await queryRecordingInput(f.descriptor,{...request,include_health_context:true});assert.equal(r.coverage.journal_complete,false);assert.equal(r.input_health_context.latest_timed_protection_notification_before_interval,null);assert.equal(r.input_health_context.latest_timed_listener_notification_before_interval,null);assert.equal(r.input_health_context.retained_event_protection_snapshots_in_interval.unknown,1);
 for(const row of [{kind:'input_listener',state:1,relative_ns:'-1'},{kind:'input_listener',state:'listening',host_ns:epoch,relative_ns:'-1'},{kind:'input_gap',reason:'x'.repeat(129),relative_ns:'-1'},{kind:'input_gap',reason:'queue_overflow',events_skipped:-1,relative_ns:'-1'}]){
  await writeFile(f.path,[header,row,footer].map(x=>JSON.stringify(x)).join('\n')+'\n');await assert.rejects(()=>queryRecordingInput(f.descriptor,{...request,include_health_context:true}),e=>e.code==='input_query');assert.equal(inputQueryHealth().active,false);await queryRecordingInput(f.descriptor,request);
 }
 assert.throws(()=>validateInputQuery({...request,include_health_context:'true'}),e=>e.code==='bad_input_query');
});
test('context summaries bound snapshots, filter tokens independently and bind input cursors',async t=>{
 const rows=[header,...Array.from({length:66},()=>contextRow(1,2)),contextRow(1,2,{action_token:other}),event(10),event(20),footer];
 const f=await fixture(t,rows);const query={...request,include_context:true,action_tokens:[action],limit:1};
 const a=await queryRecordingInput(f.descriptor,query);assert.equal(a.captured_context.selection.eligible_updates,66);assert.equal(a.captured_context.selection.action_filtered,1);assert.equal(a.captured_context.updates.length,64);assert.equal(a.captured_context.selection.truncated,true);
 const b=await queryRecordingInput(f.descriptor,{...query,cursor:a.next_cursor});assert.deepEqual(b.captured_context,a.captured_context);assert.equal(b.events[0].relative_ns,'20');
 await assert.rejects(()=>queryRecordingInput(f.descriptor,{...query,include_context:false,cursor:a.next_cursor}),/different query/);
 const defaultA=await queryRecordingInput(f.descriptor,{...request,limit:1});const defaultB=await queryRecordingInput(f.descriptor,{...request,limit:1,include_context:false});assert.deepEqual(defaultA.next_cursor,defaultB.next_cursor);
});
test('malformed context refuses only explicit context reads and preserves protected/restart uncertainty',async t=>{
 for(const patch of [{end_ns:null,state:'closed'},{start_ns:'1.5'},{deadline_ns:'1'},{clock_domain:'wall'},{context:{before_state:'x'.repeat(1501)}},{target:{bundle_id:'com.apple.finder',pid:true}}]){
  const f=await fixture(t,[header,contextRow(1,2,patch),footer]);await assert.rejects(()=>queryRecordingInput(f.descriptor,{...request,include_context:true}),e=>e.code==='input_query');assert.equal(inputQueryHealth().active,false);
  await queryRecordingInput(f.descriptor,request);
 }
 const r=contextRow(1,null,{state:'interrupted',result:'interrupted',end_kind:'unknown_after_engine_restart'}),f=await fixture(t,[header,r,{kind:'input_gap',reason:'protected_input'},footer]);
 const a=await queryRecordingInput(f.descriptor,{...request,include_context:true});assert.equal(a.captured_context.updates[0].end_relative_ns,null);assert.equal(a.coverage.gaps_with_unknown_time,1);
 assert.throws(()=>validateInputQuery({...request,include_context:1}),e=>e.code==='bad_input_query');
});
test('snapshot/query-bound pages retain duplicates and refuse changed filter/file cursors',async t=>{
 const f=await fixture(t,[header,...[1,1,2,3,4].map(n=>event(n)),footer]);const q={...request,limit:2};
 let r=await queryRecordingInput(f.descriptor,q);const values=r.events.map(e=>e.relative_ns);let pages=1;
 const cursor=r.next_cursor;assert.ok(cursor);
 while(r.next_cursor){r=await queryRecordingInput(f.descriptor,{...q,cursor:r.next_cursor});values.push(...r.events.map(e=>e.relative_ns));pages++}
 assert.deepEqual(values,['1','1','2','3','4']);assert.equal(pages,3);assert.equal(r.selection.eligible_events,5);
 await assert.rejects(()=>queryRecordingInput(f.descriptor,{...q,event_types:[10],cursor}),/different query/);
 await writeFile(f.path,(await readFile(f.path,'utf8')).replace('"key_code":8','"key_code":9'));
 await assert.rejects(()=>queryRecordingInput(f.descriptor,{...q,cursor}),/snapshot changed/);
});
test('terminal partial coverage, busy admission and corrupted/private fields fail honestly',async t=>{
 const f=await fixture(t,[header,event(1)]);f.descriptor.state='failed';f.descriptor.source_packet.complete=false;
 const first=queryRecordingInput(f.descriptor,request);assert.equal(inputQueryHealth().active,true);await assert.rejects(()=>queryRecordingInput(f.descriptor,request),e=>e.code==='input_query_busy');
 const r=await first;assert.equal(r.events.length,1);assert.equal(r.coverage.footer_present,false);assert.equal(r.coverage.journal_complete,false);assert.equal(r.coverage.rows_lost,null);assert.equal(inputQueryHealth().active,false);
 await assert.rejects(()=>queryRecordingInput({...f.descriptor,state:'recording'},request),/terminal/);
 for(const rows of [[header,event(1,{relative_ns:'2'}),footer],[header,event(1,{secure_input_snapshot:true}),footer],[header,event(1,{action_ids:['spoof']}),footer],[header,{...footer,epoch_host_ns:'1'}],[header,header,footer],[header,footer,event(1)]]){
  await writeFile(f.path,rows.map(x=>JSON.stringify(x)).join('\n')+'\n');await assert.rejects(()=>queryRecordingInput(f.descriptor,request));assert.equal(inputQueryHealth().active,false);
 }
 await writeFile(f.path,JSON.stringify(header)+'\n{malformed}\n');await assert.rejects(()=>queryRecordingInput(f.descriptor,request),/Malformed/);
 await writeFile(f.path,JSON.stringify(header)+'\n'+JSON.stringify(event(1)));await assert.rejects(()=>queryRecordingInput(f.descriptor,request),/Unterminated/);
 const link=join(f.root,'link');await symlink(f.path,link);await assert.rejects(()=>queryRecordingInput({...f.descriptor,source_packet:{...f.descriptor.source_packet,path:link}},request));
});
test('invalid requests and bounded journal/read sizes refuse without widening scope',async t=>{
 for(const q of [{...request,recording_id:'../elsewhere'},{...request,from_relative_ns:0},{...request,to_relative_ns:'0'},{...request,to_relative_ns:'3600000000001'},{...request,event_types:[10,10]},{...request,action_tokens:['not-a-token']},{...request,include_unassociated:false},{...request,limit:257},{...request,cursor:{after_row:0,snapshot_sha256:'0'.repeat(64),query_sha256:'0'.repeat(64)}},{...request,path:'/elsewhere'}])assert.throws(()=>validateInputQuery(q),e=>e.code==='bad_input_query');
 assert.deepEqual(validateInputQuery(validateInputQuery(request)),validateInputQuery(request));
 const f=await fixture(t,[header,footer]);await writeFile(f.path,JSON.stringify(header)+'\n'+JSON.stringify({kind:'other',padding:'x'.repeat(1048576)})+'\n');await assert.rejects(()=>queryRecordingInput(f.descriptor,request),/line budget/);
 await writeFile(f.path,JSON.stringify(header)+'\n'+'\n'.repeat(250000));await assert.rejects(()=>queryRecordingInput(f.descriptor,request),/row\/line budget/);
});
test('actual MCP input query negotiates capability, validates before RPC and only reads source',async t=>{
 const f=await fixture(t,[header,{kind:'input_gap',reason:'secure_input_enabled',relative_ns:'-5'},contextRow(0,20),event(1),footer]);await writeFile(join(f.root,'unused'),'');
 const runRoot=join(f.root,'run');await (await import('node:fs/promises')).mkdir(runRoot);
 let supported=true;const calls=[];const sockets=new Set();
 const fake=net.createServer(s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));createInterface({input:s}).on('line',line=>{const q=JSON.parse(line);calls.push(q.method);const result=q.method==='status'?{capabilities:{source_journal:supported?1:0}}:q.method==='record.source'?f.descriptor:null;s.write(JSON.stringify({id:q.id,result})+'\n')})});
 await new Promise(resolve=>fake.listen(join(runRoot,'engine.sock'),resolve));
 const child=spawn(process.execPath,[fileURLToPath(new URL('../server.mjs',import.meta.url))],{env:{...process.env,RECORD_SCREEN_HOME:f.root},stdio:['pipe','pipe','pipe']});child.stderr.resume();
 const pending=new Map();let serial=0;const lines=createInterface({input:child.stdout});lines.on('line',line=>{const r=JSON.parse(line),p=pending.get(r.id);if(p){clearTimeout(p.timer);pending.delete(r.id);p.resolve(r.result)}});
 const send=(method,params)=>new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>reject(new Error('owned MCP deadline')),5000);pending.set(id,{resolve,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n')});
 try{
  await send('initialize',{protocolVersion:'2025-06-18'});
  const status=await send('tools/call',{name:'status',arguments:{}});const adapter=JSON.parse(status.content[0].text).mcp_adapter;assert.equal(adapter.version,'0.17.0');assert.equal(adapter.retained_input_health_context,1);assert.deepEqual(adapter.input_query.health_notification_limits,{preceding:16,in_interval:32,unknown_time:16});calls.length=0;
  const invalid=await send('tools/call',{name:'recording_input',arguments:{...request,limit:257}});assert.equal(invalid.isError,true);assert.equal(calls.length,0);
  const badContext=await send('tools/call',{name:'recording_input',arguments:{...request,include_context:'true'}});assert.equal(badContext.isError,true);assert.equal(calls.length,0);
  const badHealth=await send('tools/call',{name:'recording_input',arguments:{...request,include_health_context:1}});assert.equal(badHealth.isError,true);assert.equal(calls.length,0);
  const valid=await send('tools/call',{name:'recording_input',arguments:request});assert.equal(valid.isError,false);assert.equal(JSON.parse(valid.content[0].text).events.length,1);assert.deepEqual(calls,['status','record.source']);
  calls.length=0;const contextual=await send('tools/call',{name:'recording_input',arguments:{...request,include_context:true}});assert.equal(contextual.isError,false);assert.equal(JSON.parse(contextual.content[0].text).captured_context.updates[0].context.expected_change,'Quick Look visible');assert.deepEqual(calls,['status','record.source']);
  calls.length=0;const healthy=await send('tools/call',{name:'recording_input',arguments:{...request,include_health_context:true}});assert.equal(healthy.isError,false);assert.equal(JSON.parse(healthy.content[0].text).input_health_context.latest_timed_protection_notification_before_interval.reason,'secure_input_enabled');assert.deepEqual(calls,['status','record.source']);
  supported=false;calls.length=0;const missing=await send('tools/call',{name:'recording_input',arguments:request});assert.equal(missing.isError,true);assert.deepEqual(calls,['status']);
 }finally{child.stdin.end();child.kill('SIGTERM');await new Promise(resolve=>child.exitCode!==null||child.signalCode!==null?resolve():child.once('exit',resolve));lines.close();for(const s of sockets)s.destroy();await new Promise(resolve=>fake.close(resolve))}
});
