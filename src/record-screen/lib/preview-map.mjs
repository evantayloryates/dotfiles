// Optional exact decoder-time/source join for retained previews. No capture or UI.
import { EngineError } from './client.mjs';
import { buildFrameIndex, withFrameSnapshots, validateFrameMapRequest } from './frame-map.mjs';

export function validatePreviewRequest(a) {
  const bad=()=>{throw new EngineError('bad_preview_request','Use recording_id, 1–12 finite nonnegative at_s values, optional max_width64–8192 and boolean include_source_map.');};
  if(!a||typeof a!=='object'||Array.isArray(a)||Object.keys(a).some(k=>!['recording_id','at_s','max_width','include_source_map'].includes(k))||
    typeof a.recording_id!=='string'||!/^rec_[A-Za-z0-9]+$/.test(a.recording_id)||a.recording_id.length>64||
    !Array.isArray(a.at_s)||!a.at_s.length||a.at_s.length>12||a.at_s.some(t=>!Number.isFinite(t)||t<0)||
    (a.max_width!==undefined&&(!Number.isInteger(a.max_width)||a.max_width<64||a.max_width>8192))||
    (a.include_source_map!==undefined&&typeof a.include_source_map!=='boolean'))bad();
  return {...a,max_width:a.max_width??1024};
}
const exactTime=t=>t&&typeof t.value==='string'&&/^-?[0-9]{1,24}$/.test(t.value)&&
  Number.isInteger(t.timescale)&&t.timescale>0&&t.timescale<=2147483647;

export function resolvePreviewMap(descriptor, reply, rows, probe) {
  if(reply?.recording_id!==descriptor.recording_id||!Array.isArray(reply.frames)||!reply.frames.length||reply.frames.length>12)
    throw new EngineError('preview_mapping_identity','Native preview recording identity or frame count differs; no source join.');
  const index=buildFrameIndex(descriptor,rows,probe);
  const base=index.map(validateFrameMapRequest({recording_id:descriptor.recording_id,frame_indices:[0]}));
  const mapped=reply.frames.map((f,preview_index)=>{
    const context={preview_index,requested_t_s:f.t_s,returned_decoder_time:f.frame_time??null,
      preview_pixels:[f.w??null,f.h??null]};
    if(!exactTime(f.frame_time))return {...context,included:false,reason:'missing_or_invalid_exact_decoder_time'};
    const n=BigInt(f.frame_time.value)*1000000000n,d=BigInt(f.frame_time.timescale);
    // Match the returned rational value, never rounded frame_t_s or requested t_s.
    const matches=[];
    for(let k=0;k<index.packets.length;k++){
      const p=index.packets[k].start;
      if(n*BigInt(p.denominator)===BigInt(p.numerator)*d)matches.push(k);
    }
    if(matches.length!==1)return {...context,included:false,reason:'returned_decoder_time_has_no_unique_exact_mux_start'};
    return {...context,...index.project(index.packets[matches[0]],matches[0],{desktop_points:[],desktop_regions:[]})};
  });
  return {...base,schema:'record-screen-preview-source-map/v1',state:'available',mapped,
    qualification:'Exact returned decoder timestamp joined to actual mux start and retained source reference. Coordinates use the original mux canvas, not the resized preview. This does not authenticate preview pixels or qualify fitted origins, physical presentation or unsampled content.'};
}
export async function mapPreviewFrames(descriptor,reply) {
  return withFrameSnapshots([descriptor],s=>resolvePreviewMap(descriptor,reply,s[0].rows,s[0].probe));
}

export async function readPreviewFrames(engine,request,{mapper=mapPreviewFrames}={}) {
  request=validatePreviewRequest(request);
  const {include_source_map,...nativeRequest}=request;
  const reply=await engine('record.frames',nativeRequest,60000);
  if(include_source_map!==true)return reply;
  // Keep useful images even if the separate retained source read is unavailable.
  // Never replay the native preview request after a mapping/probe failure.
  try {
    if(reply?.recording_id!==request.recording_id)throw new EngineError('preview_mapping_identity','Native preview identity differs.');
    if(!Array.isArray(reply.frames)||!reply.frames.length||reply.frames.length>12)throw new EngineError('preview_mapping_identity','Native preview count differs.');
    if(reply.frames.every(f=>!exactTime(f.frame_time)))return {...reply,source_mapping:{state:'unavailable',reason:'missing_or_invalid_exact_decoder_time'}};
    const descriptor=await engine('record.source',{recording_id:request.recording_id});
    if(descriptor?.recording_id!==request.recording_id)throw new EngineError('preview_mapping_identity','Resolved source identity differs.');
    return {...reply,source_mapping:await mapper(descriptor,reply)};
  } catch(error) {
    return {...reply,source_mapping:{state:'unavailable',reason:error instanceof EngineError?error.code:'preview_mapping_failed',
      qualification:'Preview images are preserved; this separate source read did not establish a join. No capture, export or preview was replayed.'}};
  }
}
