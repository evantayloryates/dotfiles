// Optional reception-to-mux join. Provider positions/generation stay unqualified.
import{createHash}from'node:crypto';
import{EngineError}from'./client.mjs';
import{buildFrameIndex,withFrameSnapshots}from'./frame-map.mjs';
import{clockIdentity}from'./paired-map.mjs';
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const sameLeaf=(a,b)=>['dev','ino','size','mtimeMs','ctimeMs'].every(k=>a[k]===b[k]);
const qualification='Recorder-reception instant placed on a measured mux packet interval, not the frame that reacted to input. No physical latency, provider-clock calibration, position promotion, actor or visible-content proof.';
export function resolveInputSourceContext(snapshot,events,journalStat,expectedMediaHash){
 const base={schema:'record-screen-input-source-context/v1',qualification};
 if(!sameLeaf(snapshot.files[0],journalStat))return{...base,state:'unavailable',reason:'input_journal_snapshot_mismatch'};
 const index=buildFrameIndex(snapshot.descriptor,snapshot.rows,snapshot.probe),clock=clockIdentity(index.header,snapshot.descriptor);
 if(clock.instance===null)return{...base,state:'unavailable',reason:clock.state};
 const continuity=snapshot.descriptor.source_packet?.clock_continuity;
 if(!Number.isInteger(continuity?.observed_gaps)||continuity.observed_gaps<0||typeof continuity.sample_unbounded!=='boolean')return{...base,state:'unavailable',reason:'unmeasured_clock_continuity'};
 if(continuity.observed_gaps>0||continuity.sample_unbounded)return{...base,state:'unavailable',reason:'observed_clock_discontinuity_or_unbounded_sample'};
 const mediaHash=digest(snapshot.files[1]);
 if(expectedMediaHash&&expectedMediaHash!==mediaHash)return{...base,state:'unavailable',reason:'media_snapshot_changed_between_pages',observed_media_snapshot_sha256:mediaHash};
 const contexts=[],frames=new Map();let correspondence;
 for(let offset=0;offset<events.length;offset+=64){
  const part=events.slice(offset,offset+64),mapped=index.map({recording_id:snapshot.descriptor.recording_id,host_ns:part.map(e=>e.received_host_ns),clock_domain:'CLOCK_UPTIME_RAW'});correspondence=mapped.mux_source_correspondence;
  for(let n=0;n<part.length;n++){
   const m=mapped.mapped[n];contexts.push({source_row:part[n].source_row,packet_included:m.included,frame_index:m.frame_index??null,reason:m.reason??null});
   if(!m.included||frames.has(m.frame_index))continue;
   frames.set(m.frame_index,{frame_index:m.frame_index,mux_packet_index:m.mux_packet_index,video_start_ns:m.video_start_ns,video_end_ns:m.video_end_ns,
    metadata_available:m.metadata_available,reason:m.reason??null,accepted_sequence:m.accepted_sequence??null,source_frame:m.source_frame??null,
    geometry_segment:m.geometry_segment??null,source_content_relative_ns:m.source_content_relative_ns??null,held:m.held??null,
    transform_available:m.transform_available??false,transform_reason:m.transform_reason??null,
    candidate_desktop_to_source_pixels:m.transform_available?m.geometry.desktop_points_to_source_pixels:null,source_pixels:m.geometry?.source_pixels??null,
    coordinate_qualification:'Original mux canvas; declared affine remains candidate outside tested geometry. Raw event positions are not transformed.'});
  }
 }
 return{...base,state:'available',clock:{state:'same_retained_journal_recorder_clock',instance:clock.instance,continuity},
  media_snapshot_sha256:mediaHash,media_snapshot_qualification:'Opened media leaf identity/size/mtime/ctime fingerprint, not a full-content hash or filesystem lock. Compare across pages; changed media withholds only this optional context.',
  mux_source_correspondence:correspondence,events:contexts,frames:[...frames.values()],
  selection:{page_events:events.length,packet_included_events:contexts.filter(e=>e.packet_included).length,unique_frames:frames.size}};
}
export async function mapInputReceptionFrames(descriptor,events,journalStat,expectedMediaHash){
 if(!Array.isArray(events)||events.length>256||events.some(e=>!Number.isSafeInteger(e.source_row)||e.source_row<1||typeof e.received_host_ns!=='string'||!/^\d{1,24}$/.test(e.received_host_ns)))throw new EngineError('input_source_context','Invalid bounded normalized event page.');
 if(!events.length)return{schema:'record-screen-input-source-context/v1',state:'empty_page',events:[],frames:[],qualification};
 return withFrameSnapshots([descriptor],s=>resolveInputSourceContext(s[0],events,journalStat,expectedMediaHash));
}
