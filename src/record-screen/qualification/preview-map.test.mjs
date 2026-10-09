import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EngineError } from '../lib/client.mjs';
import { resolvePreviewMap, readPreviewFrames, validatePreviewRequest } from '../lib/preview-map.mjs';

const request={recording_id:'rec_preview',at_s:[.1,.2],include_source_map:true};
function fixture(){
  const epoch=10000000000000001n;
  const geometry={source_pixels:[600,400],desktop_points_to_source_pixels:[1,0,0,1,-120,-110],content_scale:1};
  const rows=[{kind:'header',schema:'record-screen-source/v1',recording_id:'rec_preview',clock_domain:'CLOCK_UPTIME_RAW',epoch_host_ns:String(epoch)},
    {kind:'geometry',segment:0,geometry},
    {kind:'source_frame',source_frame:0,geometry_segment:0,pts_host_ns:String(epoch)},
    {kind:'encoded_frame',source_frame:0,encoded_sequence:0,relative_ns:'0',accepted:true},
    {kind:'encoded_frame',source_frame:0,encoded_sequence:1,relative_ns:'100000000',accepted:true,held:'held_for_sparse_interval'},
    {kind:'footer',complete:true,rows_lost:0}];
  return {descriptor:{recording_id:'rec_preview',state:'done',target:{type:'window',include_child_windows:false},source_packet:{epoch_host_ns:String(epoch),complete:true,rows_lost:0}},rows,
    probe:{streams:[{time_base:'1/1000000000',width:600,height:400}],packets:[{pts:'0',duration:'100000000'},{pts:'100000000',duration:'100000000'}]},
    reply:{recording_id:'rec_preview',frames:[{t_s:.09,frame_t_s:0,frame_time:{value:'0',timescale:1000000000},w:300,h:200},{t_s:.19,frame_t_s:.1,frame_time:{value:'1',timescale:10},w:300,h:200}]}};
}
test('returned rational decoder times, not requested or rounded times, identify actual held source',()=>{
  const {descriptor,reply,rows,probe}=fixture();const r=resolvePreviewMap(descriptor,reply,rows,probe);
  assert.deepEqual(r.mapped.map(x=>x.frame_index),[0,1]);
  assert.equal(r.mapped[1].source_frame,0);assert.equal(r.mapped[1].source_content_relative_ns,'0');
  assert.equal(r.mapped[1].held,'held_for_sparse_interval');assert.equal(r.epoch_host_ns,'10000000000000001');
  assert.deepEqual(r.muxed_canvas_pixels,[600,400]);assert.deepEqual(r.mapped[1].preview_pixels,[300,200]);
});
test('near times and missing/unsafe decoder fields do not borrow a nearest packet or rounded field',()=>{
  const f=fixture();f.reply.frames=[
    {frame_time:{value:'100000001',timescale:1000000000},frame_t_s:.1},
    {frame_t_s:.1}, {frame_time:{value:100000000,timescale:1000000000}},
    {frame_time:{value:'1',timescale:0}}, {frame_time:{value:'-1',timescale:10}}];
  const r=resolvePreviewMap(f.descriptor,f.reply,f.rows,f.probe);
  assert(r.mapped.every(x=>x.included===false));assert.equal(r.mapped[0].reason,'returned_decoder_time_has_no_unique_exact_mux_start');
});
test('fractional nanosecond packet joins are exact but missing journal metadata remains unavailable',()=>{
  const f=fixture();f.probe.streams[0].time_base='1/3';f.probe.packets=[{pts:'0',duration:'1'},{pts:'1',duration:'1'}];
  f.reply.frames=[{frame_time:{value:'1',timescale:3}}];
  const r=resolvePreviewMap(f.descriptor,f.reply,f.rows,f.probe).mapped[0];
  assert.equal(r.frame_index,1);assert.equal(r.included,true);assert.equal(r.metadata_available,false);
  assert.equal(r.reason,'mux_packet_has_no_exact_journal_match');assert.deepEqual(r.video_start_ns,{numerator:'1000000000',denominator:'3'});
});
test('fitted child guard and missing source references survive a decoder join',()=>{
  const f=fixture();f.descriptor.target.include_child_windows=true;f.rows[1].geometry.content_scale=.5;
  let r=resolvePreviewMap(f.descriptor,f.reply,f.rows,f.probe).mapped[1];assert.equal(r.transform_available,false);assert.equal(r.transform_reason,'fitted_child_window_origin_unqualified');
  f.rows=f.rows.filter(x=>x.kind!=='source_frame');r=resolvePreviewMap(f.descriptor,f.reply,f.rows,f.probe).mapped[1];
  assert.equal(r.metadata_available,false);assert.equal(r.reason,'missing_source_or_geometry_reference');
});
test('default preview response is unchanged and makes no source lookup',async()=>{
  const f=fixture(),calls=[];const out=await readPreviewFrames(async(m,a,t)=>{calls.push([m,a,t]);return f.reply;},{...request,include_source_map:false},{mapper:()=>assert.fail()});
  assert.equal(out,f.reply);assert.deepEqual(calls,[['record.frames',{recording_id:'rec_preview',at_s:[.1,.2],max_width:1024},60000]]);
});
test('older native previews retain images and explicitly withhold joins without probing source',async()=>{
  const f=fixture(),calls=[];delete f.reply.frames[0].frame_time;delete f.reply.frames[1].frame_time;
  const out=await readPreviewFrames(async m=>{calls.push(m);return f.reply;},request,{mapper:()=>assert.fail()});
  assert.deepEqual(calls,['record.frames']);assert.equal(out.frames,f.reply.frames);assert.equal(out.source_mapping.reason,'missing_or_invalid_exact_decoder_time');
});
test('source or probe failure preserves images; no second preview dispatch',async()=>{
  for(const sourceFails of [false,true]){
    const f=fixture(),calls=[];const out=await readPreviewFrames(async m=>{calls.push(m);if(m==='record.frames')return f.reply;if(sourceFails)throw new EngineError('engine_down','private diagnostic');return f.descriptor;},request,{mapper:()=>{throw new EngineError('frame_mapping_busy','private diagnostic');}});
    assert.deepEqual(calls,['record.frames','record.source']);assert.equal(out.frames,f.reply.frames);
    assert.equal(out.source_mapping.state,'unavailable');assert(!JSON.stringify(out.source_mapping).includes('private diagnostic'));
  }
});
test('identity mismatch is refused without borrowing source from another recording',async()=>{
  const f=fixture();f.reply.recording_id='rec_other';assert.throws(()=>resolvePreviewMap(f.descriptor,f.reply,f.rows,f.probe));
  let calls=0;const r=await readPreviewFrames(async()=>{calls++;return f.reply;},request);assert.equal(calls,1);assert.equal(r.source_mapping.reason,'preview_mapping_identity');
});
test('invalid preview request refuses before any native dispatch',async()=>{
  for(const patch of [{include_source_map:'true'},{at_s:[NaN]},{at_s:[-1]},{at_s:[]},{max_width:0},{max_width:99999},{extra:true}]){
    assert.throws(()=>validatePreviewRequest({...request,...patch}));
    await assert.rejects(readPreviewFrames(()=>assert.fail('dispatched invalid request'),{...request,...patch}));
  }
});
