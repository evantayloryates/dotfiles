// Frame-bound retained registration. File paths, decoding and clocks stay service-owned.
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {EngineError,enginePaths} from './client.mjs';
import {buildFrameIndex,withFrameSnapshots} from './frame-map.mjs';
import {resolvePairedMap} from './paired-map.mjs';
import {regionSchema,validateRegions,projectRegions} from './region-map.mjs';
const bad=m=>{throw new EngineError('bad_registered_frame',m)};
let worker=null;
export const registrationHealth=()=>({worker:worker?{...worker}:null,backup_selection:'nearest_retained_source_content_time',shared_worker_lease:'kernel_advisory_per_recorder_home',deadline_ms:40000,primary_pixel_budget:1000000,backup_pixel_budget:8000000});
export const registeredFrameSchema={type:'object',additionalProperties:false,properties:{
 primary_recording_id:{type:'string',pattern:'^rec_[A-Za-z0-9]+$',maxLength:64},backup_recording_id:{type:'string',pattern:'^rec_[A-Za-z0-9]+$',maxLength:64},
 primary_frame_index:{type:'integer',minimum:0,maximum:119999},anchors:{...regionSchema,minItems:2,maxItems:4},verification_regions:{...regionSchema,minItems:1,maxItems:4},
 max_content_delta_ns:{type:'string',pattern:'^[0-9]{1,9}$',description:'Maximum absolute retained source-content time difference,0–250000000ns; default50000000. Not physical clock calibration.'},
 desktop_regions:regionSchema},required:['primary_recording_id','backup_recording_id','primary_frame_index','anchors','verification_regions']};
export function validateRegisteredFrame(a){
 if(!a||typeof a!=='object'||Array.isArray(a)||Object.keys(a).some(k=>!Object.hasOwn(registeredFrameSchema.properties,k))||
 ![a.primary_recording_id,a.backup_recording_id].every(v=>typeof v==='string'&&v.length<=64&&/^rec_[A-Za-z0-9]+$/.test(v))||a.primary_recording_id===a.backup_recording_id||
 !Number.isInteger(a.primary_frame_index)||a.primary_frame_index<0||a.primary_frame_index>119999||
 !Array.isArray(a.anchors)||a.anchors.length<2||a.anchors.length>4||!Array.isArray(a.verification_regions)||a.verification_regions.length<1||a.verification_regions.length>4||
 (a.max_content_delta_ns!==undefined&&(typeof a.max_content_delta_ns!=='string'||!/^\d{1,9}$/.test(a.max_content_delta_ns)||BigInt(a.max_content_delta_ns)>250000000n)))bad('Use distinct recording IDs, exact primary_frame_index,2–4 anchors,1–4 independent verification_regions and optional bounded source-content delta/desktop_regions. No paths, caller clocks, affine override or thresholds.');
 const anchors=validateRegions(a.anchors),verification=validateRegions(a.verification_regions);
 if(new Set([...anchors,...verification].map(r=>r.id)).size!==anchors.length+verification.length)bad('Anchor and verification IDs must be globally unique.');
 // Quarter-phase anchor extraction can extend the declared region. Reserve a
 // conservative15point gap: max .75px at the minimum supported density .05.
 for(const v of verification)for(const r of anchors)if(Math.min(v.x+v.w,r.x+r.w+15)>Math.max(v.x,r.x)&&Math.min(v.y+v.h,r.y+r.h+15)>Math.max(v.y,r.y))bad('Verification regions must be independent of all anchor sampling extents.');
 return {...a,anchors,verification_regions:verification,desktop_regions:validateRegions(a.desktop_regions),max_content_delta_ns:a.max_content_delta_ns??'50000000'};
}
const unavailable=(base,reason)=>({...base,state:'unavailable',reason,registered_desktop_to_primary_pixels:null,desktop_regions:null});
export function selectRegisteredFrames(snapshots,a){
 a=validateRegisteredFrame(a);
 if(snapshots.length!==2||snapshots[0].descriptor.recording_id!==a.primary_recording_id||snapshots[1].descriptor.recording_id!==a.backup_recording_id)bad('Resolved registration identity mismatch.');
 const indexes=snapshots.map(s=>buildFrameIndex(s.descriptor,s.rows,s.probe));
 const primaryMap=indexes[0].map({recording_id:a.primary_recording_id,frame_indices:[a.primary_frame_index]});const primary=primaryMap.mapped[0];
 const base={schema:'record-screen-registered-frame/v1',primary_recording_id:a.primary_recording_id,backup_recording_id:a.backup_recording_id,primary,
 qualification:'Independent retained image registration/verification for this selected frame only. No continuous map, semantic ownership, physical presentation or automatic production source-map override.',limits:['Caller regions are hypotheses. Repeated/flat/missing texture or unqualified clocks remain refused.','Original mux canvas coordinates, not resized previews. Registered translation is local evidence, not a change to recording_frame_map.']};
 if(!primary.included||!primary.metadata_available||primary.source_content_relative_ns==null)return {result:unavailable(base,'primary_source_unavailable')};
 const sourceHost=indexes[0].epoch+BigInt(primary.source_content_relative_ns);
 const pair=resolvePairedMap(snapshots,{primary_recording_id:a.primary_recording_id,backup_recording_id:a.backup_recording_id,host_start_ns:String(sourceHost),host_end_ns:String(sourceHost+1n),clock_domain:'CLOCK_UPTIME_RAW',max_segments:1});
 base.clock_alignment=pair.clock_alignment;
 if(!pair.clock_alignment.qualified)return {result:unavailable(base,'unqualified_common_clock')};
 if(![pair.primary,pair.backup].every(m=>m.mux_source_correspondence.journal_complete))return {result:unavailable(base,'incomplete_source_journal')};
 const covering=pair.segments[0].backup;base.backup=covering;
 // Preserve the coverage refusal: nearest-content selection cannot bridge a
 // missing packet interval. Offline registration may use a later packet when
 // its retained source is closer; presentation coverage alone biases the
 // previous frame and can mismatch fast-changing pixels.
 if(!covering.included||!covering.metadata_available||!covering.transform_available||covering.source_content_host_ns==null)return {result:unavailable(base,'backup_projection_unavailable')};
 let selected=covering.frame_index,nearest=null;
 for(let n=0;n<indexes[1].packets.length;n++){
  const p=indexes[1].packets[n];
  if(!p.accepted||!p.source||!p.geometry||p.source.pts_host_ns==null)continue;
  const stamp=String(p.source.pts_host_ns);
  if(!/^[0-9]{1,24}$/.test(stamp))return {result:unavailable(base,'invalid_backup_content_clock')};
  const delta=BigInt(stamp)-sourceHost,distance=delta<0n?-delta:delta;
  if(nearest===null||distance<nearest||(distance===nearest&&n===covering.frame_index)){nearest=distance;selected=n;}
 }
 const p=indexes[1].packets[selected],mapped=indexes[1].project(p,selected,{desktop_points:[],desktop_regions:[]});
 const host=BigInt(p.source.pts_host_ns),hostTime=t=>t?{numerator:String(BigInt(t.numerator)+indexes[1].epoch*BigInt(t.denominator)),denominator:t.denominator}:null;
 const backup={...mapped,host_packet_start_ns:hostTime(p.start),host_packet_end_ns:hostTime(p.end),source_content_host_ns:{numerator:String(host),denominator:'1'},content_age_at_segment_start_ns:{numerator:String(sourceHost-host),denominator:'1'}};base.backup=backup;
 base.backup_selection={policy:'nearest_retained_source_content_time',covering_frame_index:covering.frame_index,selected_frame_index:selected,packet_candidates:indexes[1].packets.length,tie_break:'covering_packet_then_first_presentation_order',qualification:'Offline frame-local selection only; future output packets permitted, no image-based candidate retries or coverage-gap bridging.'};
 if(!backup.metadata_available||!backup.transform_available)return {result:unavailable(base,'backup_projection_unavailable')};
 const bh=backup.source_content_host_ns;if(bh.denominator!=='1')return {result:unavailable(base,'fractional_backup_content_clock')};
 const delta=BigInt(bh.numerator)-sourceHost;base.source_content_delta_ns=String(delta);base.max_content_delta_ns=a.max_content_delta_ns;
 if((delta<0n?-delta:delta)>BigInt(a.max_content_delta_ns))return {result:unavailable(base,'source_content_delta_exceeded')};
 const matrix=primary.geometry?.desktop_points_to_source_pixels,affine=backup.geometry?.desktop_points_to_source_pixels;
 if(!Array.isArray(matrix)||matrix.length!==6||!matrix.every(Number.isFinite)||matrix[1]!==0||matrix[2]!==0||matrix[0]!==matrix[3]||matrix[0]<.05||matrix[0]>8)return {result:unavailable(base,'primary_density_unqualified')};
 if(!Array.isArray(affine)||affine.length!==6||!affine.every(Number.isFinite)||affine[1]!==0||affine[2]!==0||affine[0]!==affine[3]||affine[0]<.05||affine[0]>8)return {result:unavailable(base,'backup_affine_unqualified')};
 const dimensions=[primaryMap.muxed_canvas_pixels,pair.backup.muxed_canvas_pixels];
 if(dimensions.some((p,n)=>!Array.isArray(p)||p.length!==2||!p.every(v=>Number.isInteger(v)&&v>0)||p[0]*p[1]>(n?8000000:1000000)))return {result:unavailable(base,'decoded_pixel_budget')};
 if(projectRegions([...a.anchors,...a.verification_regions],affine,dimensions[1]).some(r=>r.canvas_relation!=='contained'))return {result:unavailable(base,'backup_regions_clipped')};
 return {base,config:{primary_index:primary.frame_index,backup_index:backup.frame_index,frame_times:[primary.video_start_ns,backup.video_start_ns],dimensions,primary_scale:matrix[0],backup_affine:affine,anchors:a.anchors,verification_regions:a.verification_regions}};
}
function runWorker(fds,config){
 if(worker)throw new EngineError('registration_busy','Prior owned registration worker is active or not confirmed closed.');
 return new Promise((resolve,reject)=>{
  const child=spawn(process.env.RECORD_SCREEN_REGISTRATION_PYTHON||'python3',[fileURLToPath(new URL('./registered-frame.py',import.meta.url))],{detached:true,stdio:['pipe','pipe','pipe',...fds]});
  worker={pid:child.pid??null,quarantined:false};let settled=false,bytes=0,diagnostics=0,chunks=[];
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(value)};
  const stop=reason=>{if(settled)return;worker.quarantined=true;try{process.kill(-child.pid,'SIGKILL')}catch{}finish(new EngineError('registration_worker',reason))};
  const timer=setTimeout(()=>stop('Owned registration worker exceeded40seconds; no capture or preview replayed.'),40000);
  child.stdout.on('data',data=>{bytes+=data.length;if(bytes>512*1024)stop('Registration response exceeded512KiB.');else if(!settled)chunks.push(data)});
  child.stderr.on('data',data=>{diagnostics+=data.length;if(diagnostics>32768)stop('Registration diagnostic budget exceeded.')});
  child.stdin.on('error',()=>{});child.once('error',()=>finish(new EngineError('registration_dependency','Owned registration worker unavailable; configure Python with NumPy/Pillow.')));
  child.once('close',code=>{worker=null;if(settled)return;if(code!==0)return finish(new EngineError('registration_worker','Owned decoder/registration failed; preserve source.'));try{finish(null,JSON.parse(Buffer.concat(chunks)))}catch{finish(new EngineError('registration_worker','Invalid bounded registration reply.'))}});
  child.stdin.end(JSON.stringify({...config,lease_path:enginePaths().root+'/run/registration-reader.lock',ffmpeg:process.env.FFMPEG_PATH||'ffmpeg'}));
 });
}
export async function mapRegisteredFrame(primary,backup,request){
 const a=validateRegisteredFrame(request);
 return withFrameSnapshots([primary,backup],async(snapshots,fds)=>{
  const selected=selectRegisteredFrames(snapshots,a);if(selected.result)return selected.result;
  selected.base.source_snapshots=snapshots.map(s=>({recording_id:s.descriptor.recording_id,opened_leaves:s.files,metadata_sha256:createHash('sha256').update(JSON.stringify({rows:s.rows,probe:s.probe})).digest('hex')}));
  const observed=await runWorker(fds,selected.config),base={...selected.base,image_registration:observed};
  if(observed?.state!=='verified')return unavailable(base,observed?.reason??'independent_image_verification_failed');
  const decoded=observed.decoded_frames,verification=observed.independent_verification;
  const rational=t=>t&&typeof t.numerator==='string'&&/^-?[0-9]{1,24}$/.test(t.numerator)&&typeof t.denominator==='string'&&/^[0-9]{1,24}$/.test(t.denominator)&&BigInt(t.denominator)>0n;
  if(!Array.isArray(decoded)||decoded.length!==2||decoded.some((f,n)=>f.frame_index!==selected.config[['primary_index','backup_index'][n]]||!rational(f.frame_time_ns)||BigInt(f.frame_time_ns.numerator)*BigInt(selected.config.frame_times[n].denominator)!==BigInt(selected.config.frame_times[n].numerator)*BigInt(f.frame_time_ns.denominator)||JSON.stringify(f.pixels)!==JSON.stringify(selected.config.dimensions[n])||typeof f.decoded_rgb_sha256!=='string'||!(/^[a-f0-9]{64}$/).test(f.decoded_rgb_sha256))||
   !Array.isArray(verification)||verification.length!==a.verification_regions.length||verification.some((v,n)=>v.id!==a.verification_regions[n].id||v.verified!==true||!Number.isFinite(v.rgb_ncc)||v.rgb_ncc<.9||v.rgb_ncc>1.00000001||!Number.isFinite(v.normalized_mean_absolute_error)||v.normalized_mean_absolute_error<0||v.normalized_mean_absolute_error>.1))throw new EngineError('registration_worker','Incomplete decoded identity or independent verification proof.');
  const m=observed.registered_desktop_to_primary_pixels;
  if(!Array.isArray(m)||m.length!==6||!m.every(Number.isFinite)||m[0]!==selected.config.primary_scale||m[3]!==m[0]||m[1]!==0||m[2]!==0)throw new EngineError('registration_worker','Invalid registered matrix.');
  return {...base,state:'available',registered_desktop_to_primary_pixels:m,desktop_regions:projectRegions(a.desktop_regions,m,selected.config.dimensions[0]),production_source_map_changed:false};
 });
}
