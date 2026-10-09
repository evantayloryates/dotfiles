import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { mapRecordingFrames, resolveFrameMap, validateFrameMapRequest, frameMapHealth } from '../lib/frame-map.mjs';
import { projectRegions } from '../lib/region-map.mjs';

const request = { recording_id:'rec_fixture',frame_indices:[0,1,2],desktop_points:[{x:160,y:558}] };
function fixture() {
  const g = factor => ({ source_pixels:[600,392],desktop_points_to_source_pixels:[factor,0,0,factor,-120*factor,-430*factor],transform_qualification:'candidate_fixture' });
  const rows = [{ kind:'header',schema:'record-screen-source/v1',recording_id:'rec_fixture',clock_domain:'CLOCK_UPTIME_RAW',epoch_host_ns:'10000000000000001' },
    {kind:'geometry',segment:0,geometry:g(1)}, {kind:'source_frame',source_frame:8,geometry_segment:0,pts_host_ns:'10000000000000001'},
    {kind:'encoded_frame',source_frame:8,encoded_sequence:0,relative_ns:'0',accepted:true,held:'preroll_at_start'},
    {kind:'geometry',segment:1,geometry:g(.75)}, {kind:'source_frame',source_frame:9,geometry_segment:1,pts_host_ns:'10000000100000001'},
    {kind:'encoded_frame',source_frame:9,encoded_sequence:1,relative_ns:'100000000',accepted:true,held:null},
    // New geometry must not replace the held frame's referenced content geometry.
    {kind:'geometry',segment:2,geometry:g(1)}, {kind:'source_frame',source_frame:10,geometry_segment:2,pts_host_ns:'10000000200000001'},
    {kind:'encoded_frame',source_frame:9,encoded_sequence:2,relative_ns:'200000000',accepted:true,held:'held_for_sparse_interval'},
    {kind:'footer',complete:true,rows_lost:0}];
  const descriptor = { recording_id:'rec_fixture',state:'done',source_packet:{epoch_host_ns:rows[0].epoch_host_ns,complete:true,rows_lost:0} };
  const probe = { streams:[{time_base:'1/1000000000',width:600,height:392}],packets:[{pts:0,duration:100000000},{pts:100000000,duration:100000000},{pts:200000000,duration:100000000}] };
  return { rows,descriptor,probe };
}
test('dynamic source joins preserve referenced held geometry and exact clocks beyond JS integer range', () => {
  const {rows,descriptor,probe} = fixture();const out = resolveFrameMap(descriptor,request,rows,probe);
  assert.equal(out.mux_source_correspondence.timestamp_correspondence_complete,true);
  assert.deepEqual(out.mapped.map(r=>r.geometry_segment),[0,1,1]);
  assert.deepEqual(out.mapped.map(r=>r.desktop_points[0].source_pixels),[{x:40,y:128},{x:30,y:96},{x:30,y:96}]);
  assert.equal(out.mapped[2].source_content_relative_ns,'100000000');
  assert.equal(out.mapped[2].video_start_ns.numerator,'200000000');
  const host=resolveFrameMap(descriptor,{recording_id:'rec_fixture',host_ns:['10000000000000000','10000000000000001','10000000100000001'],clock_domain:'CLOCK_UPTIME_RAW'},rows,probe);
  assert.deepEqual(host.mapped.map(x=>x.frame_index),[undefined,0,1]);assert.deepEqual(host.mapped.map(x=>x.relative_ns),['-1','0','100000000']);
});
test('region clipping follows each actual source and retains held geometry', () => {
  const {rows,descriptor,probe} = fixture();
  const out = resolveFrameMap(descriptor,{...request,desktop_regions:[{id:'menu',x:650,y:450,w:100,h:100}]},rows,probe);
  assert.deepEqual(out.mapped.map(r=>r.desktop_regions[0].canvas_relation),['clipped','contained','contained']);
  assert.equal(out.mapped[0].desktop_regions[0].canvas_area_fraction,.7);
  assert.equal(out.mapped[1].desktop_regions[0].canvas_area_fraction,1);
  assert.deepEqual(out.mapped[1].desktop_regions,out.mapped[2].desktop_regions);
  assert.equal(out.mapped[0].desktop_regions[0].content_presence,'unverified');
  assert.equal(out.mapped[2].source_content_relative_ns,'100000000');
});
test('fitted child window positions are withheld without losing source joins or restored maps', () => {
  const {rows,descriptor,probe} = fixture();
  rows[1].geometry.content_scale=1;
  rows.find(r=>r.kind==='geometry'&&r.segment===1).geometry.content_scale=.2763157784938812;
  const query={...request,desktop_regions:[{id:'text',x:140,y:440,w:40,h:20}]};
  for(const child of [true,undefined]) {
    const source={...descriptor,target:{type:'window',...(child===undefined?{}:{include_child_windows:child})}};
    const out=resolveFrameMap(source,query,rows,probe);
    assert.equal(out.mux_source_correspondence.timestamp_correspondence_complete,true);
    assert.equal(out.mapped[0].transform_available,true);
    for(const r of out.mapped.slice(1)) {
      assert.equal(r.transform_available,false);
      assert.equal(r.transform_reason,'fitted_child_window_origin_unqualified');
      assert.equal(r.desktop_points,null);assert.equal(r.desktop_regions,null);
      assert.equal(r.geometry.content_scale,.2763157784938812);
      assert.equal(r.geometry_segment,1);assert.equal(r.metadata_available,true);
    }
  }
  // The actual record.source descriptor has neither target nor resolved.
  // Capture-row effective settings and the journal header carry this scope.
  const retained=structuredClone(rows);
  retained[0].target={type:'window',include_child_windows:false};
  retained.splice(1,0,{kind:'capture',resolved:{kind:'window',capture_options:{include_child_windows_effective:true}}});
  const fromSource=resolveFrameMap(descriptor,query,retained,probe);
  assert.equal(fromSource.mapped[1].transform_reason,'fitted_child_window_origin_unqualified');
  retained[1].resolved.capture_options.include_child_windows_effective=false;
  assert.equal(resolveFrameMap(descriptor,query,retained,probe).mapped[1].transform_available,true);
  // Effective child exclusion wins over a caller request; ordinary display
  // scaling and existing authored shrink proofs are separate scopes.
  for(const source of [
    {...descriptor,target:{type:'window',include_child_windows:true},resolved:{kind:'window',capture_options:{include_child_windows_effective:false}}},
    {...descriptor,target:{type:'rect',include_apps:['com.test.App']}},
  ]) assert.equal(resolveFrameMap(source,query,rows,probe).mapped[1].transform_available,true);
});
test('region polygon area handles rotation/reflection without substituting its bounding box', () => {
  const r = projectRegions([{id:'rotated',x:0,y:0,w:1,h:1}],[1,1,-1,1,0,0],[2,2])[0];
  assert.equal(r.canvas_relation,'clipped');assert.equal(r.canvas_area_fraction,.5);
  assert.deepEqual(r.source_bounds,{x:-1,y:0,w:2,h:2});
  const reflected = projectRegions([{id:'reflected',x:0,y:0,w:10,h:10}],[-1,0,0,1,5,0],[10,10])[0];
  assert.equal(reflected.canvas_relation,'clipped');assert.equal(reflected.canvas_area_fraction,.5);
});
test('regions distinguish exact canvas edges, touching/outside and numerical unknowns', () => {
  const rs = projectRegions([{id:'edges',x:0,y:0,w:10,h:10},{id:'touch',x:10,y:0,w:5,h:5},
    {id:'outside',x:-20,y:0,w:5,h:5}], [1,0,0,1,0,0],[10,10]);
  assert.deepEqual(rs.map(r=>r.canvas_relation),['contained','outside','outside']);
  assert.deepEqual(rs.map(r=>r.canvas_area_fraction),[1,0,0]);
  assert.throws(()=>projectRegions([{id:'overflow',x:1,y:1,w:10,h:10}],[1e308,0,0,1,0,0],[10,10]),e=>e.code==='frame_mapping');
});
test('missing frame/source/affine does not manufacture region coverage', () => {
  const {rows,descriptor,probe} = fixture();const a={...request,frame_indices:[0,1,9],desktop_regions:[{id:'text',x:140,y:440,w:40,h:20}]};
  rows[1].geometry.desktop_points_to_source_pixels=[0,0,0,0,0,0];
  const out=resolveFrameMap(descriptor,a,rows,probe);
  assert.equal(out.mapped[0].desktop_regions,null);assert.equal(out.mapped[2].included,false);assert.equal(out.mapped[2].desktop_regions,undefined);
  rows.splice(rows.findIndex(r=>r.kind==='geometry'&&r.segment===1),1);
  const missing=resolveFrameMap(descriptor,a,rows,probe);assert.equal(missing.mapped[1].metadata_available,false);assert.equal(missing.mapped[1].desktop_regions,undefined);
});
test('region requests reject duplicate ids, invalid shapes and payload expansion before reads', () => {
  const region={id:'menu',x:0,y:0,w:10,h:10};
  for(const regions of [null,{},[region,region],[{...region,w:0}],[{...region,h:-1}],[{...region,x:Infinity}],
    [{...region,id:'arbitrary text'}],[{...region,id:'x'.repeat(65)}],[{...region,label:'extra'}],
    Array.from({length:17},(_,i)=>({...region,id:'r'+i}))]) {
    assert.throws(()=>validateFrameMapRequest({...request,desktop_regions:regions}),e=>e.code==='bad_frame_map');
  }
  assert.equal(validateFrameMapRequest({...request,desktop_regions:[region]}).desktop_regions.length,1);
});
test('declared canvas must match muxed dimensions before point or region projection', () => {
  const {rows,descriptor,probe}=fixture();const a={...request,desktop_regions:[{id:'text',x:140,y:440,w:40,h:20}]};
  probe.streams[0].width=64;
  let r=resolveFrameMap(descriptor,a,rows,probe);assert.equal(r.mapped[0].transform_available,false);
  assert.equal(r.mapped[0].transform_reason,'declared_canvas_differs_from_muxed_dimensions');
  assert.equal(r.mapped[0].desktop_regions,null);assert.equal(r.mapped[0].desktop_points,null);
  assert.equal(r.mux_source_correspondence.timestamp_correspondence_complete,true);
  delete probe.streams[0].width;r=resolveFrameMap(descriptor,a,rows,probe);
  assert.equal(r.mapped[0].transform_reason,'unmeasured_muxed_canvas');assert.equal(r.muxed_canvas_pixels,null);
});
test('exact offset boundaries, rational media clocks and presentation order do not round or borrow', () => {
  const {rows,descriptor,probe} = fixture();
  const out = resolveFrameMap(descriptor,{recording_id:'rec_fixture',relative_ns:['-1','0','99999999','100000000','299999999','300000000']},rows,probe);
  assert.deepEqual(out.mapped.map(x=>x.frame_index),[undefined,0,0,1,2,undefined]);
  assert.equal(out.mapped.at(-1).reason,'at_or_after_muxed_video_end');
  const shuffled = {...probe,packets:[probe.packets[2],probe.packets[0],probe.packets[1]]};
  assert.deepEqual(resolveFrameMap(descriptor,request,rows,shuffled).mapped.map(x=>x.mux_packet_index),[1,2,0]);
  const fractional = {streams:[{time_base:'1/3'}],packets:[{pts:1,duration:1}]};
  const r = resolveFrameMap(descriptor,{recording_id:'rec_fixture',frame_indices:[0]},rows,fractional).mapped[0];
  assert.deepEqual(r.video_start_ns,{numerator:'1000000000',denominator:'3'});assert.equal(r.metadata_available,false);
  const hole=structuredClone(probe);hole.packets[0].duration=1;
  assert.equal(resolveFrameMap(descriptor,{recording_id:'rec_fixture',relative_ns:['50000000']},rows,hole).mapped[0].reason,'between_measured_packet_intervals');
});
test('failed video preserves known packets while unmatched submissions, lost rows and missing references stay explicit', () => {
  const {rows,descriptor,probe} = fixture();descriptor.state='failed';probe.packets.pop();
  const out = resolveFrameMap(descriptor,request,rows,probe);
  assert.equal(out.mux_source_correspondence.accepted_without_video_packet,1);assert.equal(out.mux_source_correspondence.timestamp_correspondence_complete,false);
  assert.equal(out.mapped[2].included,false);assert.equal(out.mapped[1].metadata_available,true);
  descriptor.source_packet.complete=false;descriptor.source_packet.rows_lost=1;rows.splice(rows.findIndex(r=>r.kind==='geometry'&&r.segment===1),1);
  const partial = resolveFrameMap(descriptor,request,rows,probe);
  assert.equal(partial.mapped[1].reason,'missing_source_or_geometry_reference');assert.equal(partial.mapped[1].metadata_available,false);
  assert.equal(partial.mux_source_correspondence.journal_complete,false);assert.equal(partial.mux_source_correspondence.source_reference_coverage_complete,false);
});
test('singular/missing maps and unmeasured tail are unknown; canvas bounds do not imply visible content', () => {
  const {rows,descriptor,probe} = fixture();rows[1].geometry.desktop_points_to_source_pixels=[0,0,0,0,0,0];
  probe.packets.at(-1).duration=undefined;
  const out = resolveFrameMap(descriptor,{...request,desktop_points:[{x:9999,y:9999}]},rows,probe);
  assert.equal(out.mapped[0].transform_available,false);assert.equal(out.mapped[0].desktop_points,null);
  assert.equal(out.mapped[1].desktop_points[0].inside_encoded_canvas,false);
  assert.equal(resolveFrameMap(descriptor,{recording_id:'rec_fixture',relative_ns:['200000000']},rows,probe).mapped[0].reason,'unmeasured_last_packet_end');
});
test('identity, duplicate times, unsafe integers and malformed queries refuse before inference', () => {
  for(const patch of [{frame_indices:[],relative_ns:undefined},{frame_indices:[-1]},{relative_ns:['1.2'],frame_indices:undefined},{frame_indices:[0],relative_ns:['0']},{desktop_points:[{x:0,y:Infinity}]},{path:'/tmp/arbitrary'},{frame_indices:undefined,host_ns:['1']},{clock_domain:'CLOCK_UPTIME_RAW'},{frame_indices:undefined,host_ns:['1'],clock_domain:'external'}])
    assert.throws(()=>validateFrameMapRequest({...request,...patch}),e=>e.code==='bad_frame_map');
  const {rows,descriptor,probe} = fixture();
  assert.throws(()=>resolveFrameMap({...descriptor,recording_id:'rec_other'},request,rows,probe));
  const duplicate=structuredClone(probe);duplicate.packets[1].pts=0;assert.throws(()=>resolveFrameMap(descriptor,request,rows,duplicate));
  const unsafe=structuredClone(probe);unsafe.packets[0].pts=Number.MAX_SAFE_INTEGER+1;assert.throws(()=>resolveFrameMap(descriptor,request,rows,unsafe));
  rows[3].host_ns='1';assert.throws(()=>resolveFrameMap(descriptor,request,rows,probe));
});

test('actual regular-file probe, leaf refusal and fresh MCP read-only boundary', async () => {
  const root=mkdtempSync(join(tmpdir(),'frame-map-mcp-'));mkdirSync(join(root,'run'));
  const {rows,descriptor}=fixture();const video=join(root,'source.mp4'),journal=join(root,'source.jsonl');
  const generated=spawnSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=white:s=600x392:r=10','-frames:v','3','-c:v','libx264','-bf','0','-video_track_timescale','1000000000',video],{encoding:'utf8'});
  assert.equal(generated.status,0,'Required local ffmpeg fixture generator failed');
  writeFileSync(journal,rows.map(r=>JSON.stringify(r)+'\n').join(''));descriptor.source_packet.path=journal;descriptor.video={path:video};
  const methods=[],sockets=new Set();let capable=true;
  const fake=net.createServer(socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));createInterface({input:socket}).on('line',line=>{const row=JSON.parse(line);methods.push(row.method);socket.write(JSON.stringify({id:row.id,result:row.method==='status'?{capabilities:{source_journal:capable?1:0}}:descriptor})+'\n');});});
  await new Promise((resolve,reject)=>{fake.once('error',reject);fake.listen(join(root,'run/engine.sock'),resolve);});
  const child=spawn(process.execPath,[fileURLToPath(new URL('../server.mjs',import.meta.url))],{env:{...process.env,RECORD_SCREEN_HOME:root},stdio:['pipe','pipe','pipe']});child.stderr.resume();
  const pending=new Map();let serial=0;const lines=createInterface({input:child.stdout});
  lines.on('line',line=>{const row=JSON.parse(line),p=pending.get(row.id);if(p){clearTimeout(p.timer);pending.delete(row.id);p.resolve(row.result);}});
  const rpc=(method,params)=>new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>reject(Error('Owned MCP deadline')),5000);pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
  try {
    const initialized=await rpc('initialize',{protocolVersion:'2025-06-18'});assert.equal(initialized.serverInfo.version,'0.16.0');
    const list=await rpc('tools/list',{});const tool=list.tools.find(x=>x.name==='recording_frame_map');assert.equal(tool.annotations.readOnlyHint,true);assert.equal(tool.inputSchema.properties.desktop_regions.maxItems,16);
    let reply=await rpc('tools/call',{name:'recording_frame_map',arguments:{...request,desktop_regions:[{id:'region',x:140,y:450,w:10,h:10}]}});assert.equal(reply.isError,false);
    assert.equal(JSON.parse(reply.content[0].text).mapped[0].desktop_regions[0].canvas_relation,'contained');
    assert.equal(JSON.parse(reply.content[0].text).mux_source_correspondence.actual_packets,3);assert.deepEqual(methods,['status','record.source']);
    reply=await rpc('tools/call',{name:'recording_frame_map',arguments:{...request,frame_indices:[]}});assert.equal(reply.isError,true);assert.deepEqual(methods,['status','record.source']);
    reply=await rpc('tools/call',{name:'recording_frame_map',arguments:{...request,desktop_regions:[{id:'bad',x:0,y:0,w:0,h:1}]}});assert.equal(reply.isError,true);assert.deepEqual(methods,['status','record.source']);
    capable=false;reply=await rpc('tools/call',{name:'recording_frame_map',arguments:request});assert.equal(reply.isError,true);assert.equal(methods.at(-1),'status');
    const status=JSON.parse((await rpc('tools/call',{name:'status',arguments:{}})).content[0].text);assert.equal(status.mcp_adapter.source_frame_mapping,1);assert.equal(status.mcp_adapter.source_region_mapping,1);assert.equal(status.mcp_adapter.fitted_child_mapping_guard,1);assert.equal(status.mcp_adapter.frame_mapping.active,false);
    const link=join(root,'linked.jsonl');symlinkSync(journal,link);const linked=structuredClone(descriptor);linked.source_packet.path=link;
    await assert.rejects(mapRecordingFrames(linked,request));assert.equal(frameMapHealth().active,false);
    writeFileSync(journal,rows.map(r=>JSON.stringify(r)+'\n').join('')+'{"kind":');await assert.rejects(mapRecordingFrames(descriptor,request),e=>e.code==='frame_mapping');assert.equal(frameMapHealth().active,false);
  } finally {
    child.stdin.end();await new Promise(resolve=>child.once('exit',resolve));lines.close();
    for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('cleanup'));}for(const socket of sockets)socket.destroy();
    await new Promise(resolve=>fake.close(resolve));rmSync(root,{recursive:true,force:true});
  }
});

test('unresponsive owned probe refuses a concurrent call and settles after one deadline stop', async () => {
  const root=mkdtempSync(join(tmpdir(),'frame-map-probe-deadline-'));
  const oldPath=process.env.PATH,oldProbe=process.env.FFPROBE_PATH;const {rows,descriptor}=fixture();
  const journal=join(root,'source.jsonl'),video=join(root,'source.mp4'),probe=join(root,'ffprobe');
  writeFileSync(journal,rows.map(r=>JSON.stringify(r)+'\n').join(''));writeFileSync(video,'owned diagnostic sentinel');
  writeFileSync(probe,`#!${process.execPath}\nsetInterval(()=>{},1000);\n`);chmodSync(probe,0o700);
  descriptor.source_packet.path=journal;descriptor.video={path:video};
  try {
    process.env.PATH=root;process.env.FFPROBE_PATH=probe;
    const first=mapRecordingFrames(descriptor,request);
    const rejected=assert.rejects(first,e=>e.code==='frame_mapping_probe');
    const deadline=Date.now()+2000;
    while(!frameMapHealth().probe&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));
    assert.ok(frameMapHealth().probe?.pid);assert.equal(frameMapHealth().active,true);
    await assert.rejects(mapRecordingFrames(descriptor,request),e=>e.code==='frame_mapping_busy');
    await rejected;
    const closed=Date.now()+2000;
    while(frameMapHealth().probe&&Date.now()<closed)await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(frameMapHealth().probe,null);assert.equal(frameMapHealth().active,false);
  } finally {process.env.PATH=oldPath;if(oldProbe===undefined)delete process.env.FFPROBE_PATH;else process.env.FFPROBE_PATH=oldProbe;rmSync(root,{recursive:true,force:true});}
});
