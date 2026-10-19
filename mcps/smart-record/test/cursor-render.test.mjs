import test from'node:test';import assert from'node:assert/strict';
import{validateCursorRecipe,buildCursorTimeline}from'../src/lib/cursor-render.mjs';
const id='rec_cursorFixture',epoch='10000000000000001',clock={id:'11111111-1111-1111-1111-111111111111',kind:'recorder_process'};
const r=()=>validateCursorRecipe({recording_id:id,asset_path:'/tmp/cursor.svg',hotspot:[.23,4.14],coordinate_basis:'acknowledged_recorder_desktop_candidate',fps:10,max_width:200});
function fixture(){return{descriptor:{recording_id:id,state:'done',source_packet:{epoch_host_ns:epoch,complete:true,rows_lost:0,clock_instance:clock,clock_continuity:{observed_gaps:0,sample_unbounded:false}}},probe:{streams:[{time_base:'1/1000000000',width:200,height:100}],packets:[{pts:0,duration:100000000},{pts:100000000,duration:100000000},{pts:200000000,duration:100000000}]},rows:[{kind:'header',schema:'smart-record-source/v1',recording_id:id,clock_domain:'CLOCK_UPTIME_RAW',epoch_host_ns:epoch,clock_instance:clock,target:{type:'rect'}},{kind:'geometry',segment:0,geometry:{source_pixels:[200,100],desktop_points_to_source_pixels:[1,0,0,1,-100,-200]}},{kind:'source_frame',source_frame:0,geometry_segment:0,pts_host_ns:epoch},...['0','100000000','200000000'].map((relative_ns,i)=>({kind:'encoded_frame',source_frame:0,encoded_sequence:i,relative_ns,accepted:true,held:i?'held_for_sparse_interval':null})),{kind:'input_event',type:1,received_host_ns:epoch,relative_ns:'0',raw_position:{x:130,y:240},_source_row:100,action_ids:[]},{kind:'input_event',type:10,received_host_ns:String(BigInt(epoch)+150000000n),relative_ns:'150000000',_source_row:101},{kind:'footer',complete:true,rows_lost:0}]}}
test('exact epoch, measured held pictures and hotspot-ready projected positions',()=>{const t=buildCursorTimeline(fixture(),r());assert.equal(t.frames.length,3);assert.deepEqual(t.frames[0].pointer,{x:30,y:40,source_row:100});assert.equal(t.frames[1].source_content_relative_ns,'0');assert.equal(t.frames[1].held,'held_for_sparse_interval');assert.equal(t.frames[2].pointer,null);assert.deepEqual(t.frames[1].video_time_ns,{numerator:'1000000000',denominator:'10'});assert.equal(t.frames[0].click.progress,0)});
test('selection, hold duration and typing behavior are configurable',()=>{const f=fixture();assert.equal(buildCursorTimeline(f,{...r(),max_hold_ms:50}).frames[1].pointer,null);assert.notEqual(buildCursorTimeline(f,{...r(),hide_on_typing:false}).frames[2].pointer,null);assert.throws(()=>buildCursorTimeline(f,{...r(),source_rows:[101]}),/No selected/)});
test('clock gaps, unqualified fitted origins and missing frame coverage refuse',()=>{let f=fixture();f.descriptor.source_packet.clock_continuity.observed_gaps=1;assert.throws(()=>buildCursorTimeline(f,r()),/clock/);f=fixture();f.rows[0].target={type:'window'};f.rows[1].geometry.content_scale=.5;assert.throws(()=>buildCursorTimeline(f,r()),/fitted/);f=fixture();delete f.rows[3].accepted;assert.throws(()=>buildCursorTimeline(f,r()),/unavailable/)});
test('invalid or over-budget recipes refuse before capture/filesystem work',()=>{for(const patch of [{hotspot:[NaN,0]},{opacity:2},{fps:0},{from_s:5,to_s:4},{to_s:61},{coordinate_basis:'guess'},{source_rows:[1,1]},{asset_path:'relative'},{extra:true}])assert.throws(()=>validateCursorRecipe({...r(),...patch}));});
test('Escape and command/control shortcuts do not masquerade as typing',()=>{
 for(const patch of [{key_code:53,flags:'0'},{key_code:0,flags:String(1<<20)},{key_code:0,flags:String(1<<18)}]){
  const f=fixture();Object.assign(f.rows.find(x=>x.type===10),patch);
  const t=buildCursorTimeline(f,r());assert.notEqual(t.frames[2].pointer,null);assert.equal(t.pointer_coverage.positioned_frames,3);
 }
 const f=fixture();Object.assign(f.rows.find(x=>x.type===10),{key_code:0,flags:'0'});
 assert.equal(buildCursorTimeline(f,r()).frames[2].pointer,null);
});
test('coverage exposes initial absence, expired holds and intentional typing hide',()=>{
 let t=buildCursorTimeline(fixture(),r());assert.equal(t.pointer_coverage.absence_frames_by_reason.typing_hide,1);assert.equal(t.pointer_coverage.unpositioned_frames,1);assert.equal(t.warnings.length,1);
 t=buildCursorTimeline(fixture(),{...r(),max_hold_ms:50});assert.equal(t.pointer_coverage.absence_frames_by_reason.hold_expired,2);assert.equal(t.pointer_coverage.longest_unpositioned_s,.2);
 const f=fixture(),e=f.rows.find(x=>x.type===1);e.relative_ns='100000000';e.received_host_ns=String(BigInt(epoch)+100000000n);
 t=buildCursorTimeline(f,{...r(),hide_on_typing:false});assert.equal(t.pointer_coverage.absence_frames_by_reason.no_prior_position,1);assert.equal(t.pointer_coverage.first_position_output_s,.1);
 assert.match(t.pointer_coverage.qualification,/not visible cursor pixels/);
});

test('idle hold preserves measured positions without trajectory or initial backfill',()=>{
 const f=fixture(),e=f.rows.find(x=>x.type===1);e.relative_ns='100000000';e.received_host_ns=String(BigInt(epoch)+100000000n);
 const t=buildCursorTimeline(f,{...r(),idle_policy:'hold_last',max_hold_ms:0,hide_on_typing:false});
 assert.equal(t.frames[0].pointer,null);assert.equal(t.frames[0].pointer_absence,'no_prior_position');
 assert.deepEqual(t.frames[1].pointer,t.frames[2].pointer);assert.equal(t.frames[2].pointer_position_age_ns,'100000000');
 assert.equal(t.pointer_coverage.held_beyond_max_hold_frames,1);assert.equal(t.pointer_coverage.idle_policy,'hold_last');
 assert.throws(()=>validateCursorRecipe({...r(),idle_policy:'smooth'}));
});
test('input interruptions break holds until a new retained position, even with source selection',()=>{
 const f=fixture();f.rows.splice(-1,0,{kind:'input_gap',relative_ns:'100000000',host_ns:String(BigInt(epoch)+100000000n),_source_row:102});
 let t=buildCursorTimeline(f,{...r(),idle_policy:'hold_last',hide_on_typing:false,source_rows:[100]});
 assert.equal(t.frames[1].pointer_absence,'input_interruption');assert.equal(t.frames[1].click,null);assert.equal(t.frames[2].pointer,null);
 f.rows.splice(-1,0,{...f.rows.find(x=>x.type===1),relative_ns:'200000000',received_host_ns:String(BigInt(epoch)+200000000n),_source_row:103,raw_position:{x:140,y:250}});
 t=buildCursorTimeline(f,{...r(),idle_policy:'hold_last',hide_on_typing:false});assert.equal(t.frames[2].pointer.x,40);
 assert.equal(t.pointer_coverage.absence_frames_by_reason.input_interruption,1);
});
test('unknown interruption clocks and lost journals refuse idle holds',()=>{
 let f=fixture();f.rows.splice(-1,0,{kind:'input_gap'});assert.throws(()=>buildCursorTimeline(f,{...r(),idle_policy:'hold_last'}),/exact time/);
 f=fixture();f.descriptor.source_packet.rows_lost=1;assert.throws(()=>buildCursorTimeline(f,{...r(),idle_policy:'hold_last'}),/loss-free/);
 f=fixture();f.rows.splice(-1,0,{kind:'input_listener',state:'disabled',relative_ns:'100000000'});
 assert.equal(buildCursorTimeline(f,{...r(),idle_policy:'hold_last'}).frames[1].pointer_absence,'input_interruption');
});
