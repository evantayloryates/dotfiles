import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync,writeFileSync,mkdirSync,rmSync,symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn,spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { resolvePairedMap,mapRecordingPair,validatePairedMapRequest } from '../lib/paired-map.mjs';
import { frameMapHealth } from '../lib/frame-map.mjs';

const epoch=10000000000000001n,instance={kind:'recorder_process',id:'11111111-2222-3333-4444-555555555555'};
const request={primary_recording_id:'rec_primary',backup_recording_id:'rec_backup',
  host_start_ns:String(epoch),host_end_ns:String(epoch+2000000000n),clock_domain:'CLOCK_UPTIME_RAW',
  desktop_regions:[{id:'menu',x:120,y:110,w:20,h:20}]};
function lane(id,count,interval,held=false,e=epoch) {
  const geometry={source_pixels:[64,64],desktop_points_to_source_pixels:[1,0,0,1,-120,-110],content_scale:1};
  const rows=[{kind:'header',schema:'record-screen-source/v1',recording_id:id,clock_domain:'CLOCK_UPTIME_RAW',
    epoch_host_ns:String(e),clock_instance:instance,target:{type:'rect',x:120,y:110,w:64,h:64}},
    {kind:'geometry',segment:0,geometry}];
  for(let i=0;i<count;i++) {
    rows.push({kind:'source_frame',source_frame:i,geometry_segment:0,pts_host_ns:String(e+BigInt(i)*interval)});
    rows.push({kind:'encoded_frame',source_frame:held?0:i,encoded_sequence:i,relative_ns:String(BigInt(i)*interval),
      accepted:true,held:held&&i>0?'held_for_sparse_interval':null});
  }
  rows.push({kind:'footer',complete:true,rows_lost:0});
  return {descriptor:{recording_id:id,state:'done',source_packet:{epoch_host_ns:String(e),clock_instance:instance,complete:true,rows_lost:0,
    clock_continuity:{observed_gaps:0,sample_unbounded:false}}},rows,
    probe:{streams:[{time_base:'1/1000000000',width:64,height:64}],packets:Array.from({length:count},(_,i)=>({pts:String(BigInt(i)*interval),duration:String(interval)}))}};
}
const pair=()=>[lane('rec_primary',2,1000000000n,true),lane('rec_backup',8,250000000n)];
test('dense backup intervals survive sparse held primary frames with exact content age and region scope',()=>{
  const out=resolvePairedMap(pair(),request);
  assert.equal(out.clock_alignment.qualified,true);assert.equal(out.segment_count,8);
  assert.deepEqual(out.segments.map(s=>s.primary.frame_index),[0,0,0,0,1,1,1,1]);
  assert.deepEqual(out.segments.map(s=>s.backup.frame_index),[0,1,2,3,4,5,6,7]);
  assert.equal(out.segments[5].primary.source_frame,0);
  assert.deepEqual(out.segments[5].primary.content_age_at_segment_start_ns,{numerator:'1250000000',denominator:'1'});
  assert.deepEqual(out.segments[5].backup.content_age_at_segment_start_ns,{numerator:'0',denominator:'1'});
  assert(out.segments.every(s=>s.backup_timing_available&&s.backup_projection_available&&s.content_presence==='unverified'));
  assert.equal(out.segments[0].backup.desktop_regions[0].canvas_relation,'contained');
  assert.equal(out.segments.at(-1).host_end_ns.numerator,request.host_end_ns);
  assert.equal(out.backup.source_scope.target.type,'rect');assert.equal(out.has_more,false);
});
test('primary-relative ranges synchronize through the retained epoch without consumer clock arithmetic',()=>{
  const {host_start_ns,host_end_ns,clock_domain,...args}=request;
  const relative={...args,primary_relative_start_ns:'0',primary_relative_end_ns:'2000000000'};
  const out=resolvePairedMap(pair(),relative);assert.deepEqual(out.segments,resolvePairedMap(pair(),request).segments);
  assert.equal(out.requested_interval.basis,'primary_relative');assert.equal(out.requested_interval.host_start_ns,host_start_ns);
  const leading=resolvePairedMap(pair(),{...relative,primary_relative_start_ns:'-1'});
  assert.equal(leading.segments[0].backup.reason,'before_first_muxed_packet');
  for(const patch of [{clock_domain:'CLOCK_UPTIME_RAW'},{host_start_ns},{primary_relative_end_ns:undefined}])
    assert.throws(()=>validatePairedMapRequest({...relative,...patch}),e=>e.code==='bad_paired_map');
});
test('different exact epochs create explicit uncovered leading/trailing intervals, never nearest bridging',()=>{
  const snapshots=pair();snapshots[1]=lane('rec_backup',6,250000000n,false,epoch+250000000n);
  const out=resolvePairedMap(snapshots,request);
  assert.equal(out.segments[0].backup.reason,'before_first_muxed_packet');
  assert.equal(out.segments.at(-1).backup.reason,'at_or_after_muxed_video_end');
  assert.equal(out.segments[1].backup.frame_index,0);assert.equal(out.segments[1].backup.source_content_host_ns.numerator,String(epoch+250000000n));
});
test('measured packet holes and unmeasured tails stay absent rather than borrowing later content',()=>{
  const snapshots=pair();snapshots[1].probe.packets[1].duration='1';delete snapshots[1].probe.packets[7].duration;
  const out=resolvePairedMap(snapshots,request);
  const gap=out.segments.find(s=>s.backup.reason==='between_measured_packet_intervals');
  assert(gap);assert.equal(gap.backup_timing_available,false);
  assert.equal(gap.host_start_ns.numerator,String(epoch+250000001n));
  assert.equal(out.segments.at(-1).backup.reason,'unmeasured_last_packet_end');
});
test('fractional mux boundaries remain rational beyond safe JS integers and unmatched references remain unknown',()=>{
  const snapshots=pair();snapshots[1].probe={streams:[{time_base:'1/3',width:64,height:64}],packets:[{pts:0,duration:1},{pts:1,duration:1}]};
  const out=resolvePairedMap(snapshots,request);
  assert.deepEqual(out.segments[0].host_end_ns,{numerator:String(epoch*3n+1000000000n),denominator:'3'});
  assert.equal(out.segments[1].backup.reason,'mux_packet_has_no_exact_journal_match');
  assert.equal(out.segments[1].backup_timing_available,false);
});
test('legacy, different process, mismatched descriptor and missing/gapped continuity cannot qualify shared clocks',()=>{
  for(const kind of ['legacy','different','mismatch','missing_continuity','gap','unbounded']) {
    const snapshots=structuredClone(pair());
    if(kind==='legacy'){delete snapshots[1].rows[0].clock_instance;delete snapshots[1].descriptor.source_packet.clock_instance;}
    if(kind==='different'){const c={...instance,id:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'};snapshots[1].rows[0].clock_instance=c;snapshots[1].descriptor.source_packet.clock_instance=c;}
    if(kind==='mismatch')snapshots[1].descriptor.source_packet.clock_instance={...instance,id:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'};
    if(kind==='missing_continuity')delete snapshots[1].descriptor.source_packet.clock_continuity;
    if(kind==='gap')snapshots[1].descriptor.source_packet.clock_continuity.observed_gaps=1;
    if(kind==='unbounded')snapshots[1].descriptor.source_packet.clock_continuity.sample_unbounded=true;
    const out=resolvePairedMap(snapshots,request);assert.equal(out.clock_alignment.qualified,false,kind);
    assert(out.segments.every(s=>!s.backup_timing_available&&!s.backup_projection_available));
    assert.equal(out.timeline_qualification,'numeric_candidate_only_unqualified_clock_alignment');
  }
});
test('fitted backups retain temporal/source references while withholding spatial positions',()=>{
  const snapshots=pair();snapshots[1].rows[0].target={type:'window',include_child_windows:true};snapshots[1].rows[1].geometry.content_scale=.5;
  const out=resolvePairedMap(snapshots,request);
  assert(out.segments.every(s=>s.backup_timing_available&&!s.backup_projection_available));
  assert.equal(out.segments[0].backup.transform_reason,'fitted_child_window_origin_unqualified');
  assert.equal(out.segments[0].backup.desktop_regions,null);
});
test('failed prefix, missing geometry and incomplete journals remain separate from retained clock identity',()=>{
  const snapshots=pair();snapshots[1].descriptor.state='failed';snapshots[1].probe.packets.pop();
  let out=resolvePairedMap(snapshots,request);assert.equal(out.backup.mux_source_correspondence.accepted_without_video_packet,1);
  assert.equal(out.backup.mux_source_correspondence.timestamp_correspondence_complete,false);
  assert.equal(out.segments.at(-1).backup_timing_available,false);
  snapshots[1].rows.splice(1,1);snapshots[1].descriptor.source_packet.complete=false;snapshots[1].descriptor.source_packet.rows_lost=1;
  out=resolvePairedMap(snapshots,request);assert.equal(out.clock_alignment.qualified,true);
  assert(out.segments.every(s=>!s.backup_timing_available));assert.equal(out.backup.mux_source_correspondence.journal_complete,false);
});
test('preroll content age may be negative and is never presented as fresh physical input timing',()=>{
  const snapshots=pair();snapshots[1].rows.find(r=>r.kind==='source_frame').pts_host_ns=String(epoch+10000000n);
  const out=resolvePairedMap(snapshots,request);
  assert.deepEqual(out.segments[0].backup.content_age_at_segment_start_ns,{numerator:'-10000000',denominator:'1'});
});
test('snapshot-bound pagination preserves all rational segments and refuses changed request/source',()=>{
  const snapshots=pair(),all=resolvePairedMap(snapshots,request),first=resolvePairedMap(snapshots,{...request,max_segments:3});
  assert.equal(first.has_more,true);const second=resolvePairedMap(snapshots,{...request,max_segments:5,cursor:first.next_cursor});
  assert.deepEqual([...first.segments,...second.segments],all.segments);assert.equal(second.next_cursor,null);
  const reordered=Object.fromEntries(Object.entries(request).reverse());
  reordered.desktop_regions=request.desktop_regions.map(r=>Object.fromEntries(Object.entries(r).reverse()));
  assert.deepEqual(resolvePairedMap(snapshots,{...reordered,cursor:first.next_cursor,max_segments:5}).segments,second.segments);
  assert.throws(()=>resolvePairedMap(snapshots,{...request,host_end_ns:String(epoch+1999999999n),cursor:first.next_cursor}),e=>e.code==='paired_mapping_cursor');
  const changed=structuredClone(snapshots);changed[1].rows[1].geometry.desktop_points_to_source_pixels[4]=-121;
  assert.throws(()=>resolvePairedMap(changed,{...request,cursor:first.next_cursor}),e=>e.code==='paired_mapping_cursor');
  const changedDescriptor=structuredClone(snapshots);changedDescriptor[1].descriptor.source_packet.clock_continuity.observed_gaps=1;
  assert.throws(()=>resolvePairedMap(changedDescriptor,{...request,cursor:first.next_cursor}),e=>e.code==='paired_mapping_cursor');
});
test('strict IDs/interval/projection/cursor requests refuse unsupported paths and timing assumptions',()=>{
  for(const patch of [{backup_recording_id:'rec_primary'},{host_end_ns:request.host_start_ns},{clock_domain:'external'},{fps:10},
    {path:'/tmp/arbitrary'},{max_segments:0},{max_segments:257},{cursor:'arbitrary'},{desktop_regions:[{id:'x',x:0,y:0,w:0,h:1}]},
    {desktop_points:[{x:Infinity,y:0}]}])assert.throws(()=>validatePairedMapRequest({...request,...patch}));
  const snapshots=pair();snapshots[1].descriptor.recording_id='rec_wrong';assert.throws(()=>resolvePairedMap(snapshots,request));
});

test('actual two-file probes and fresh MCP/CLI boundary preserve snapshots, advertise capability and settle readers',async()=>{
  const root=mkdtempSync(join(tmpdir(),'paired-map-mcp-'));mkdirSync(join(root,'run'));
  const snapshots=[lane('rec_primary',8,250000000n),lane('rec_backup',8,250000000n)];
  for(const [n,s]of snapshots.entries()) {
    const video=join(root,`video${n}.mp4`),journal=join(root,`source${n}.jsonl`);
    const generated=spawnSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=white:s=64x64:r=4','-frames:v','8','-c:v','libx264','-bf','0','-video_track_timescale','1000000000',video],{encoding:'utf8'});
    assert.equal(generated.status,0);writeFileSync(journal,s.rows.map(r=>JSON.stringify(r)+'\n').join(''));
    s.descriptor.source_packet.path=journal;s.descriptor.video={path:video};
  }
  const methods=[],sockets=new Set();let capable=true;
  const fake=net.createServer(socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));createInterface({input:socket}).on('line',line=>{
    const r=JSON.parse(line);methods.push(r.method);socket.write(JSON.stringify({id:r.id,result:r.method==='status'?{capabilities:{source_journal:capable?1:0}}:
      snapshots.find(s=>s.descriptor.recording_id===r.params.recording_id).descriptor})+'\n');});});
  await new Promise((resolve,reject)=>{fake.once('error',reject);fake.listen(join(root,'run/engine.sock'),resolve);});
  const guiEnv={...process.env,PATH:'/usr/bin:/bin:/usr/sbin:/sbin',RECORD_SCREEN_HOME:root};delete guiEnv.FFPROBE_PATH;
  const child=spawn(fileURLToPath(new URL('../bin/record-screen-mcp',import.meta.url)),[],{env:guiEnv,stdio:['pipe','pipe','pipe']});child.stderr.resume();
  const pending=new Map();let serial=0;const lines=createInterface({input:child.stdout});
  lines.on('line',line=>{const r=JSON.parse(line),p=pending.get(r.id);if(p){clearTimeout(p.timer);pending.delete(r.id);r.error?p.reject(Error(r.error.message)):p.resolve(r.result);}});
  const rpc=(method,params)=>new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>reject(Error('Owned MCP deadline')),15000);pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
  try {
    assert.equal((await rpc('initialize',{protocolVersion:'2025-06-18'})).serverInfo.version,'0.18.0');
    const tool=(await rpc('tools/list',{})).tools.find(t=>t.name==='recording_paired_map');assert(tool);assert.equal(tool.annotations.readOnlyHint,true);
    const response=await rpc('tools/call',{name:'recording_paired_map',arguments:{...request,max_segments:3}});assert.equal(response.isError,false);
    const first=JSON.parse(response.content[0].text);assert.equal(first.clock_alignment.qualified,true);assert.equal(first.segment_count,8);
    assert.deepEqual(methods,['status','record.source','status','record.source']);
    const second=await mapRecordingPair(snapshots[0].descriptor,snapshots[1].descriptor,{...request,cursor:first.next_cursor,max_segments:8});
    assert.equal(second.segments.length,5);assert.equal(second.has_more,false);assert.equal(frameMapHealth().active,false);assert.equal(frameMapHealth().probe,null);
    const cli=spawn(fileURLToPath(new URL('../bin/record-screen',import.meta.url)),['paired-map',JSON.stringify(request)],{env:guiEnv,stdio:['ignore','pipe','pipe']});
    let output='',error='';cli.stdout.on('data',d=>output+=d);cli.stderr.on('data',d=>error+=d);
    assert.equal(await new Promise(resolve=>cli.once('exit',resolve)),0,error);assert.equal(JSON.parse(output).segment_count,8);
    const before=methods.length;assert.equal((await rpc('tools/call',{name:'recording_paired_map',arguments:{...request,backup_recording_id:request.primary_recording_id}})).isError,true);assert.equal(methods.length,before);
    capable=false;assert.equal((await rpc('tools/call',{name:'recording_paired_map',arguments:request})).isError,true);assert.equal(methods.at(-1),'status');
    capable=true;const status=JSON.parse((await rpc('tools/call',{name:'status',arguments:{}})).content[0].text);assert.equal(status.mcp_adapter.paired_source_mapping,1);
    assert.equal(status.mcp_adapter.paired_interval_coverage_summary,1);
    assert.equal(tool.inputSchema.properties.include_coverage_summary.type,'boolean');
    const summarized=JSON.parse((await rpc('tools/call',{name:'recording_paired_map',arguments:{...request,max_segments:1,include_coverage_summary:true}})).content[0].text);
    const cliSummary=spawn(fileURLToPath(new URL('../bin/record-screen',import.meta.url)),['paired-map',JSON.stringify({...request,max_segments:1,include_coverage_summary:true})],{env:guiEnv,stdio:['ignore','pipe','pipe']});
    let summaryOutput='',summaryError='';cliSummary.stdout.on('data',d=>summaryOutput+=d);cliSummary.stderr.on('data',d=>summaryError+=d);
    assert.equal(await new Promise(resolve=>cliSummary.once('exit',resolve)),0,summaryError);
    assert.deepEqual(JSON.parse(summaryOutput).coverage_summary,summarized.coverage_summary);
    assert.equal(summarized.coverage_summary.evaluated_segments,8);
    const beforeInvalidSummary=methods.length;
    assert.equal((await rpc('tools/call',{name:'recording_paired_map',arguments:{...request,include_coverage_summary:true,desktop_regions:[]}})).isError,true);
    assert.equal(methods.length,beforeInvalidSummary);
    // Actual file reader must retain the resolved capture scope, not just the
    // requested header. This also guards a resolved child setting overriding
    // a requested false value; no geometry is borrowed from another source.
    snapshots[1].rows[0].target={type:'window',include_child_windows:false};
    snapshots[1].rows[1].geometry.content_scale=.5;
    snapshots[1].rows.splice(1,0,{kind:'capture',resolved:{kind:'window',window:{pid:321,window_id:654},capture_options:{include_child_windows_effective:true}}});
    writeFileSync(snapshots[1].descriptor.source_packet.path,snapshots[1].rows.map(r=>JSON.stringify(r)+'\n').join(''));
    const scoped=await mapRecordingPair(snapshots[0].descriptor,snapshots[1].descriptor,request);
    assert.equal(scoped.backup.source_scope.resolved.window.pid,321);
    assert(scoped.segments.every(s=>s.backup_timing_available&&!s.backup_projection_available));
    assert.equal(scoped.segments[0].backup.transform_reason,'fitted_child_window_origin_unqualified');
    await assert.rejects(mapRecordingPair(snapshots[0].descriptor,snapshots[1].descriptor,{...request,cursor:first.next_cursor}),e=>e.code==='paired_mapping_cursor');
    const link=join(root,'linked.jsonl');symlinkSync(snapshots[1].descriptor.source_packet.path,link);
    const bad=structuredClone(snapshots[1].descriptor);bad.source_packet.path=link;await assert.rejects(mapRecordingPair(snapshots[0].descriptor,bad,request));
    assert.equal(frameMapHealth().active,false);assert.equal(frameMapHealth().probe,null);
    writeFileSync(snapshots[1].descriptor.source_packet.path,snapshots[1].rows.map(r=>JSON.stringify(r)+'\n').join('')+'{"kind":');
    await assert.rejects(mapRecordingPair(snapshots[0].descriptor,snapshots[1].descriptor,request),e=>e.code==='frame_mapping');assert.equal(frameMapHealth().active,false);
  } finally {
    child.stdin.end();await new Promise(resolve=>child.once('exit',resolve));lines.close();
    for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('cleanup'));}for(const socket of sockets)socket.destroy();
    await new Promise(resolve=>fake.close(resolve));rmSync(root,{recursive:true,force:true});
  }
});

const summarize=(snapshots=pair(),patch={})=>resolvePairedMap(snapshots,{...request,include_coverage_summary:true,...patch});
const duration=(summary,lane,state,region=0)=>summary.regions[region][lane].durations_ns[state];
const ns=n=>({numerator:String(n),denominator:'1'});
test('whole-interval coverage is exact across held frames and independent of segment pages',()=>{
  const first=summarize(pair(),{max_segments:1}),full=summarize();
  assert.equal(first.returned_segments,1);assert.equal(first.has_more,true);
  assert.deepEqual(first.coverage_summary,full.coverage_summary);
  assert.deepEqual(first.coverage_summary.total_duration_ns,ns(2000000000n));
  assert.deepEqual(duration(first.coverage_summary,'backup','contained'),ns(2000000000n));
  assert.equal(first.coverage_summary.regions[0].backup.entire_interval_contained_in_canvas,true);
  assert.equal(first.coverage_summary.content_presence,'unverified');
  assert.equal(resolvePairedMap(pair(),request).coverage_summary,undefined);
});
test('dynamic regions split into contained, clipped and outside durations without content claims',()=>{
  const snapshots=pair();const geometry=snapshots[1].rows[1].geometry;
  snapshots[1].rows.splice(2,0,{kind:'geometry',segment:1,geometry:{...geometry,desktop_points_to_source_pixels:[1,0,0,1,-130,-110]}},
    {kind:'geometry',segment:2,geometry:{...geometry,desktop_points_to_source_pixels:[1,0,0,1,-1000,-110]}});
  for(const r of snapshots[1].rows)if(r.kind==='source_frame')r.geometry_segment=r.source_frame>=6?2:r.source_frame>=3?1:0;
  const s=summarize(snapshots).coverage_summary;
  assert.deepEqual(duration(s,'backup','contained'),ns(750000000));
  assert.deepEqual(duration(s,'backup','clipped'),ns(750000000));
  assert.deepEqual(duration(s,'backup','outside'),ns(500000000));
  assert.equal(s.regions[0].backup.entire_interval_contained_in_canvas,false);
  assert.equal(s.regions[0].primary.entire_interval_contained_in_canvas,true);
  assert.equal(s.content_presence,'unverified');
});
test('rational third-second mismatches partition exactly beyond safe integer epochs',()=>{
  const snapshots=pair();snapshots[1].probe={streams:[{time_base:'1/3',width:64,height:64}],packets:[{pts:0,duration:1},{pts:1,duration:1}]};
  const s=summarize(snapshots).coverage_summary;
  assert.deepEqual(duration(s,'backup','contained'),{numerator:'1000000000',denominator:'3'});
  assert.deepEqual(duration(s,'backup','unmatched_source'),{numerator:'1000000000',denominator:'3'});
  assert.deepEqual(duration(s,'backup','unmeasured_packet'),{numerator:'4000000000',denominator:'3'});
});
test('packet holes and unknown tails are explicit coverage durations, not nearest-frame rescue',()=>{
  const snapshots=pair();snapshots[1].probe.packets[1].duration='1';delete snapshots[1].probe.packets[7].duration;
  const s=summarize(snapshots).coverage_summary;
  assert.deepEqual(duration(s,'backup','unmeasured_packet'),ns(499999999));
  assert.deepEqual(duration(s,'backup','contained'),ns(1500000001));
  assert.equal(s.regions[0].backup.entire_interval_contained_in_canvas,false);
});
test('legacy clocks, incomplete journals and fitted transforms withhold whole-interval containment',()=>{
  for(const kind of ['clock','journal','fitted']){
    const snapshots=pair();
    if(kind==='clock'){delete snapshots[1].rows[0].clock_instance;delete snapshots[1].descriptor.source_packet.clock_instance;}
    if(kind==='journal'){snapshots[1].descriptor.source_packet.rows_lost=1;snapshots[1].rows.at(-1).rows_lost=1;}
    if(kind==='fitted'){snapshots[1].rows[0].target={type:'window',include_child_windows:true};snapshots[1].rows[1].geometry.content_scale=.5;}
    const s=summarize(snapshots).coverage_summary;
    assert.deepEqual(duration(s,'backup',kind==='clock'?'unqualified_clock':kind==='journal'?'unqualified_journal':'unqualified_transform'),ns(2000000000));
    assert.equal(s.regions[0].backup.entire_interval_contained_in_canvas,false);
    assert.equal(s.content_presence,'unverified');
  }
});
test('summary work budget returns unavailable without substituting a partial page',()=>{
  const out=summarize(pair(),{max_segments:1,coverage_max_segments:7});
  assert.equal(out.returned_segments,1);assert.equal(out.coverage_summary.summary_available,false);
  assert.equal(out.coverage_summary.reason,'segment_budget_exceeded');assert.equal(out.coverage_summary.evaluated_segments,0);
  assert.equal(out.coverage_summary.regions,null);assert.equal(out.coverage_summary.required_segments,8);
  assert.equal(summarize(pair(),{coverage_max_segments:8}).coverage_summary.summary_available,true);
});
test('service retry requests preserve exact intervals, holes and unknown clocks without raising work budget',()=>{
  for(const kind of ['ordinary','hole','unknown_clock']){
    const snapshots=pair();
    if(kind==='hole')snapshots[1].probe.packets[1].duration='1';
    if(kind==='unknown_clock'){delete snapshots[1].rows[0].clock_instance;delete snapshots[1].descriptor.source_packet.clock_instance;}
    const original=summarize(snapshots).coverage_summary;
    const limited=summarize(snapshots,{coverage_max_segments:3,max_segments:1}).coverage_summary;
    assert.equal(limited.summary_available,false);assert.equal(limited.evaluated_segments,0);
    const plan=limited.retry_guidance;assert.equal(plan.plan_available,true);
    assert.equal(plan.requests[0].host_start_ns,request.host_start_ns);
    assert.equal(plan.requests.at(-1).host_end_ns,request.host_end_ns);
    const totals={};
    for(let n=0;n<plan.requests.length;n++){
      const retry=plan.requests[n];assert.equal(retry.coverage_max_segments,3);
      assert.equal(retry.cursor,undefined);assert.equal(retry.max_segments,1);
      if(n)assert.equal(retry.host_start_ns,plan.requests[n-1].host_end_ns);
      validatePairedMapRequest(retry);
      const result=resolvePairedMap(snapshots,retry).coverage_summary;
      assert.equal(result.summary_available,true);assert(result.evaluated_segments<=3);
      assert.equal(result.content_presence,'unverified');
      assert.equal(result.clock_alignment_qualified,original.clock_alignment_qualified);
      for(const [state,amount]of Object.entries(result.regions[0].backup.durations_ns)){
        assert.equal(amount.denominator,'1');totals[state]=(totals[state]??0n)+BigInt(amount.numerator);
      }
    }
    for(const [state,amount]of Object.entries(original.regions[0].backup.durations_ns))
      assert.equal(totals[state],BigInt(amount.numerator),kind+' '+state);
  }
});
test('fractional retry boundaries remain unavailable instead of rounding source clocks',()=>{
  const snapshots=pair();snapshots[1].probe={streams:[{time_base:'1/3',width:64,height:64}],packets:[{pts:0,duration:1},{pts:1,duration:1}]};
  const result=summarize(snapshots,{coverage_max_segments:1}).coverage_summary;
  assert.equal(result.summary_available,false);assert.equal(result.retry_guidance.plan_available,false);
  assert.equal(result.retry_guidance.reason,'fractional_split_boundary');
  assert.equal(result.retry_guidance.requests,null);assert.equal(result.regions,null);
});
test('retry guidance refuses excessive request count without publishing a partial plan',()=>{
  const snapshots=pair();snapshots[1]=lane('rec_backup',20,100000000n);
  const result=summarize(snapshots,{coverage_max_segments:1}).coverage_summary;
  assert.equal(result.retry_guidance.required_requests,20);assert.equal(result.retry_guidance.max_requests,16);
  assert.equal(result.retry_guidance.reason,'retry_request_limit_exceeded');
  assert.equal(result.retry_guidance.requests,null);assert.equal(result.evaluated_segments,0);
});
test('coverage option and budget are cursor-bound while default false preserves existing cursors',()=>{
  const first=summarize(pair(),{max_segments:1});
  assert.throws(()=>resolvePairedMap(pair(),{...request,cursor:first.next_cursor}),e=>e.code==='paired_mapping_cursor');
  assert.throws(()=>summarize(pair(),{cursor:first.next_cursor,coverage_max_segments:4095}),e=>e.code==='paired_mapping_cursor');
  const next=summarize(pair(),{cursor:first.next_cursor,max_segments:3});assert.deepEqual(next.coverage_summary,first.coverage_summary);
  const old=resolvePairedMap(pair(),{...request,max_segments:1});
  assert.deepEqual(resolvePairedMap(pair(),{...request,cursor:old.next_cursor,include_coverage_summary:false}).segments,
    resolvePairedMap(pair(),{...request,cursor:old.next_cursor}).segments);
});
test('summary requests refuse unsupported budgets/types and missing regions before reading sources',()=>{
  for(const patch of [{include_coverage_summary:1},{include_coverage_summary:'true'},{include_coverage_summary:null},
    {include_coverage_summary:true,desktop_regions:[]},{coverage_max_segments:8},{include_coverage_summary:false,coverage_max_segments:8},
    {include_coverage_summary:true,coverage_max_segments:0},{include_coverage_summary:true,coverage_max_segments:16385},
    {include_coverage_summary:true,coverage_max_segments:1.5}])assert.throws(()=>validatePairedMapRequest({...request,...patch}),e=>e.code==='bad_paired_map');
});
