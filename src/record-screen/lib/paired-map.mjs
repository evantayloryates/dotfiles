// Service-owned interval synchronization. No pixels, edits or live capture.
import { createHash } from 'node:crypto';
import { EngineError } from './client.mjs';
import { buildFrameIndex, withFrameSnapshots, validateFrameMapRequest } from './frame-map.mjs';
import { regionSchema } from './region-map.mjs';

const bad = message => { throw new EngineError('bad_paired_map',message); };
const integer = {type:'string',pattern:'^[0-9]{1,24}$'};
const relative = {type:'string',pattern:'^-?[0-9]{1,24}$'};
const recording = {type:'string',maxLength:64,pattern:'^rec_[A-Za-z0-9]+$'};
export const pairedMapSchema = {
  type:'object',additionalProperties:false,
  properties:{primary_recording_id:recording,backup_recording_id:recording,
    host_start_ns:integer,host_end_ns:integer,clock_domain:{type:'string',enum:['CLOCK_UPTIME_RAW']},
    primary_relative_start_ns:relative,primary_relative_end_ns:relative,
    desktop_points:{type:'array',maxItems:16,items:{type:'object',additionalProperties:false,
      properties:{x:{type:'number'},y:{type:'number'}},required:['x','y']}},
    desktop_regions:regionSchema,max_segments:{type:'integer',minimum:1,maximum:256},
    include_coverage_summary:{type:'boolean',description:'Opt in to exact whole-interval durations for named regions: canvas clipping and explicit unknown states, never pixel presence.'},
    coverage_max_segments:{type:'integer',minimum:1,maximum:16384,description:'Whole-interval summary work budget, default4096. Exceeding it returns summary unavailable with bounded exact retry requests when representable; no partial coverage claim or automatic retry.'},
    cursor:{type:'string',maxLength:80,pattern:'^[a-f0-9]{64}:[0-9]{1,6}$'}},
  required:['primary_recording_id','backup_recording_id'],
  oneOf:[{required:['host_start_ns','host_end_ns','clock_domain']},{required:['primary_relative_start_ns','primary_relative_end_ns']}],
};
export function validatePairedMapRequest(a) {
  const host=a?.host_start_ns!==undefined||a?.host_end_ns!==undefined;
  const primary=a?.primary_relative_start_ns!==undefined||a?.primary_relative_end_ns!==undefined;
  const start=host?a?.host_start_ns:a?.primary_relative_start_ns,end=host?a?.host_end_ns:a?.primary_relative_end_ns;
  const validTime=v=>typeof v==='string'&&(host?/^[0-9]{1,24}$/:/^-?[0-9]{1,24}$/).test(v);
  if(!a||typeof a!=='object'||Array.isArray(a)||Object.keys(a).some(k=>!Object.hasOwn(pairedMapSchema.properties,k))||
    ![a.primary_recording_id,a.backup_recording_id].every(v=>typeof v==='string'&&v.length<=64&&/^rec_[A-Za-z0-9]+$/.test(v))||
    a.primary_recording_id===a.backup_recording_id||host===primary||
    (host?a.clock_domain!=='CLOCK_UPTIME_RAW':a.clock_domain!==undefined)||
    ![start,end].every(validTime)||BigInt(end)<=BigInt(start)||
    (a.max_segments!==undefined&&(!Number.isInteger(a.max_segments)||a.max_segments<1||a.max_segments>256))||
    (a.include_coverage_summary!==undefined&&typeof a.include_coverage_summary!=='boolean')||
    (a.coverage_max_segments!==undefined&&(a.include_coverage_summary!==true||!Number.isInteger(a.coverage_max_segments)||a.coverage_max_segments<1||a.coverage_max_segments>16384))||
    (a.cursor!==undefined&&(typeof a.cursor!=='string'||!/^[a-f0-9]{64}:[0-9]{1,6}$/.test(a.cursor))))
    bad('Use distinct primary/backup recording IDs and exactly one nonempty exact primary-relative interval or host interval in CLOCK_UPTIME_RAW; max_segments1–256, optional returned cursor and up to16 points/regions. include_coverage_summary must be boolean; coverage_max_segments1–16384 is allowed only with summary enabled and named regions.');
  const projection=validateFrameMapRequest({recording_id:a.primary_recording_id,frame_indices:[0],
    ...(a.desktop_points!==undefined?{desktop_points:a.desktop_points}:{}),
    ...(a.desktop_regions!==undefined?{desktop_regions:a.desktop_regions}:{})});
  if(a.include_coverage_summary===true&&!projection.desktop_regions.length)bad('Coverage summary requires at least one named desktop region.');
  return {...a,desktop_points:projection.desktop_points,desktop_regions:projection.desktop_regions,max_segments:a.max_segments??64,
    ...(a.include_coverage_summary===true?{coverage_max_segments:a.coverage_max_segments??4096}:{})};
}
const rat = r => ({n:BigInt(r.numerator),d:BigInt(r.denominator)});
const compare = (a,b) => a.n*b.d<b.n*a.d?-1:a.n*b.d>b.n*a.d?1:0;
const normalize = (n,d) => {
  let x=n<0n?-n:n,y=d;while(y)[x,y]=[y,x%y];const g=x||1n;
  return {numerator:String(n/g),denominator:String(d/g)};
};
const serial = a => normalize(a.n,a.d);
const plus = (a,n) => ({n:a.n+n*a.d,d:a.d});
const subtract = (a,b) => normalize(a.n*b.d-b.n*a.d,a.d*b.d);
export function clockIdentity(header,descriptor) {
  const c=header.clock_instance,s=descriptor.source_packet?.clock_instance;
  const valid=v=>v&&v.kind==='recorder_process'&&typeof v.id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v.id)&&Object.keys(v).length===2;
  if(!valid(c))return {state:'missing_or_invalid_retained_clock_instance',instance:null};
  if(!valid(s)||s.kind!==c.kind||s.id!==c.id)return {state:'descriptor_journal_clock_instance_mismatch',instance:null};
  return {state:'retained_recorder_process',instance:c};
}

/** Pure resolver used by actual-file and negative-control qualification. */
export function resolvePairedMap(snapshots,request) {
  request=validatePairedMapRequest(request);
  if(!Array.isArray(snapshots)||snapshots.length!==2||snapshots[0].descriptor?.recording_id!==request.primary_recording_id||
     snapshots[1].descriptor?.recording_id!==request.backup_recording_id)bad('Resolved primary/backup identity mismatch.');
  const indexes=snapshots.map(s=>buildFrameIndex(s.descriptor,s.rows,s.probe));
  const clocks=indexes.map((i,n)=>clockIdentity(i.header,snapshots[n].descriptor));
  let clockState=clocks.find(c=>c.instance===null)?.state??
    (clocks[0].instance.id===clocks[1].instance.id?'same_retained_recorder_process':'different_retained_recorder_processes');
  if(clockState==='same_retained_recorder_process'&&snapshots.some(s=>
    !Number.isInteger(s.descriptor.source_packet?.clock_continuity?.observed_gaps)||
    s.descriptor.source_packet.clock_continuity.observed_gaps<0||
    typeof s.descriptor.source_packet.clock_continuity.sample_unbounded!=='boolean'))
    clockState='unmeasured_clock_continuity';
  if(clockState==='same_retained_recorder_process'&&snapshots.some(s=>
    (s.descriptor.source_packet?.clock_continuity?.observed_gaps??0)>0||s.descriptor.source_packet?.clock_continuity?.sample_unbounded===true))
    clockState='observed_clock_discontinuity_or_unbounded_sample';
  const clockAligned=clockState==='same_retained_recorder_process';
  const primaryRelative=request.primary_relative_start_ns!==undefined;
  const start={n:primaryRelative?indexes[0].epoch+BigInt(request.primary_relative_start_ns):BigInt(request.host_start_ns),d:1n};
  const end={n:primaryRelative?indexes[0].epoch+BigInt(request.primary_relative_end_ns):BigInt(request.host_end_ns),d:1n};
  const boundaries=[start,end];
  const intervals=indexes.map(index=>index.packets.map(p=>({
    start:plus(rat(p.start),index.epoch),end:p.end?plus(rat(p.end),index.epoch):null})));
  for(const lane of intervals)for(const p of lane)for(const time of [p.start,p.end])
    if(time&&compare(start,time)<0&&compare(time,end)<0)boundaries.push(time);
  boundaries.sort(compare);
  const times=boundaries.filter((v,n)=>!n||compare(v,boundaries[n-1])!==0);
  const identity={request:{primary_recording_id:request.primary_recording_id,backup_recording_id:request.backup_recording_id,
    host_start_ns:String(start.n),host_end_ns:String(end.n),clock_domain:'CLOCK_UPTIME_RAW',
    desktop_points:request.desktop_points.map(p=>({x:p.x,y:p.y})),
    desktop_regions:request.desktop_regions.map(r=>({id:r.id,x:r.x,y:r.y,w:r.w,h:r.h})),
    ...(request.include_coverage_summary===true?{include_coverage_summary:true,coverage_max_segments:request.coverage_max_segments}:{})},
    snapshots:snapshots.map((s,n)=>({id:s.descriptor.recording_id,files:s.files??null,
      epoch:indexes[n].header.epoch_host_ns,clock_instance:indexes[n].header.clock_instance??null,
      retained_descriptor:{state:s.descriptor.state,target:s.descriptor.target??null,resolved:s.descriptor.resolved??null,
        video_outcome:s.descriptor.video_outcome??null,source:{epoch_host_ns:s.descriptor.source_packet?.epoch_host_ns,
          clock_instance:s.descriptor.source_packet?.clock_instance??null,complete:s.descriptor.source_packet?.complete??null,
          rows_lost:s.descriptor.source_packet?.rows_lost??null,clock_continuity:s.descriptor.source_packet?.clock_continuity??null,
          video_outcome:s.descriptor.source_packet?.video_outcome??null}},
      // Actual packet/source/geometry tables bind pure-resolver cursors too.
      digest:createHash('sha256').update(JSON.stringify({rows:s.rows,probe:s.probe})).digest('hex')}))};
  const token=createHash('sha256').update(JSON.stringify(identity)).digest('hex');
  const offset=request.cursor?Number(request.cursor.split(':')[1]):0;
  if(request.cursor&&(request.cursor.split(':')[0]!==token||offset>=times.length-1))
    throw new EngineError('paired_mapping_cursor','Source/request snapshot changed or cursor is outside this interval; read the new snapshot explicitly.');
  const projection={desktop_points:request.desktop_points,desktop_regions:request.desktop_regions};
  function frameAt(lane,time,requestedProjection=projection) {
    const table=intervals[lane],index=indexes[lane];let lo=0,hi=table.length;
    while(lo<hi){const mid=Math.floor((lo+hi)/2);if(compare(table[mid].start,time)<=0)lo=mid+1;else hi=mid;}
    const n=lo-1,p=table[n];
    if(!p)return {included:false,reason:'before_first_muxed_packet'};
    if(!p.end)return {included:false,reason:n===table.length-1?'unmeasured_last_packet_end':'unmeasured_packet_end'};
    if(compare(time,p.end)>=0)return {included:false,reason:n===table.length-1?'at_or_after_muxed_video_end':'between_measured_packet_intervals'};
    const frame=index.project(index.packets[n],n,requestedProjection);
    const source=frame.source_content_relative_ns===null||frame.source_content_relative_ns===undefined?null:
      {n:index.epoch+BigInt(frame.source_content_relative_ns),d:1n};
    return {...frame,host_packet_start_ns:serial(p.start),host_packet_end_ns:serial(p.end),
      source_content_host_ns:source?serial(source):null,content_age_at_segment_start_ns:source?subtract(time,source):null};
  }
  const stop=Math.min(times.length-1,offset+request.max_segments),segments=[];
  for(let n=offset;n<stop;n++) {
    const primary=frameAt(0,times[n]),backup=frameAt(1,times[n]);
    segments.push({segment_index:n,host_start_ns:serial(times[n]),host_end_ns:serial(times[n+1]),primary,backup,
      backup_timing_available:clockAligned&&backup.included===true&&backup.metadata_available===true,
      backup_projection_available:clockAligned&&backup.included===true&&backup.metadata_available===true&&backup.transform_available===true,
      content_presence:'unverified'});
  }
  const metadata=indexes.map((i,n)=>{
    const result=i.map({recording_id:snapshots[n].descriptor.recording_id,frame_indices:[0]});
    return {recording_id:result.recording_id,recording_state:result.recording_state,epoch_host_ns:result.epoch_host_ns,
      clock_instance:result.clock_instance,muxed_canvas_pixels:result.muxed_canvas_pixels,
      mux_source_correspondence:result.mux_source_correspondence,clock_continuity:result.clock_continuity,
      video_outcome:result.video_outcome,source_scope:{target:i.target??null,resolved:i.capture??null}};
  });
  function coverageSummary() {
    const count=times.length-1,budget=request.coverage_max_segments;
    const total=subtract(end,start);
    const common={schema:'record-screen-paired-coverage/v1',scope:'entire_requested_interval',
      total_duration_ns:total,required_segments:count,segment_budget:budget,
      clock_alignment_qualified:clockAligned,source_journal_complete:metadata.map(m=>m.mux_source_correspondence.journal_complete),
      state_precedence:['unqualified_clock (backup only)','unqualified_journal','unmeasured_packet','unmatched_source','unqualified_transform','contained/clipped/outside'],
      content_presence:'unverified'};
    if(count>budget) {
      const requiredRequests=Math.ceil(count/budget),maxRequests=16;
      const guidance={schema:'record-screen-paired-coverage-retry/v1',plan_available:false,
        required_requests:requiredRequests,max_requests:maxRequests,requests:null,
        qualification:'Read-only retry guidance from this snapshot. No summary, automatic read, budget increase or clock/content qualification.',
        limits:['Re-read terminal source snapshots through the service; preserve any later unavailable or changed-source result.',
          'Exact adjacent host intervals partition the original request; each retains the original clock, geometry and content uncertainty.',
          'Fractional split boundaries are not rounded into integer API clocks. No partial retry plan is returned.']};
      if(requiredRequests>maxRequests)guidance.reason='retry_request_limit_exceeded';
      else {
        const retries=[];
        for(let n=0;n<count;n+=budget) {
          const from=serial(times[n]),to=serial(times[Math.min(count,n+budget)]);
          if(from.denominator!=='1'||to.denominator!=='1') {
            guidance.reason='fractional_split_boundary';break;
          }
          const {host_start_ns,host_end_ns,primary_relative_start_ns,primary_relative_end_ns,clock_domain,cursor,...base}=request;
          retries.push({...base,host_start_ns:from.numerator,host_end_ns:to.numerator,clock_domain:'CLOCK_UPTIME_RAW'});
        }
        if(!guidance.reason){guidance.plan_available=true;guidance.requests=retries;}
      }
      return {...common,summary_available:false,reason:'segment_budget_exceeded',evaluated_segments:0,
        regions:null,retry_guidance:guidance};
    }
    const names=['contained','clipped','outside','unmeasured_packet','unmatched_source','unqualified_transform','unqualified_clock','unqualified_journal'];
    const zero=()=>Object.fromEntries(names.map(k=>[k,{n:0n,d:1n}]));
    const totals=request.desktop_regions.map(r=>({id:r.id,desktop_rect:{x:r.x,y:r.y,w:r.w,h:r.h},lanes:[zero(),zero()]}));
    const spatialOnly={desktop_points:[],desktop_regions:request.desktop_regions};
    for(let n=0;n<count;n++) {
      const duration=rat(subtract(times[n+1],times[n]));
      const frames=[frameAt(0,times[n],spatialOnly),frameAt(1,times[n],spatialOnly)];
      for(let lane=0;lane<2;lane++)for(const region of totals) {
        const frame=frames[lane];
        let state=lane===1&&!clockAligned?'unqualified_clock':!common.source_journal_complete[lane]?'unqualified_journal':
          !frame.included?'unmeasured_packet':!frame.metadata_available?'unmatched_source':!frame.transform_available?'unqualified_transform':null;
        if(state===null) {
          const mapped=frame.desktop_regions?.find(r=>r.id===region.id);
          if(!mapped||!['contained','clipped','outside'].includes(mapped.canvas_relation))bad('Mapped region missing from available coverage projection.');
          state=mapped.canvas_relation;
        }
        const previous=region.lanes[lane][state];
        region.lanes[lane][state]=rat(normalize(previous.n*duration.d+duration.n*previous.d,previous.d*duration.d));
      }
    }
    const regions=totals.map(r=>{
      const lanes=r.lanes.map(durations=>{
        const sum=Object.values(durations).reduce((a,b)=>rat(normalize(a.n*b.d+b.n*a.d,a.d*b.d)),{n:0n,d:1n});
        if(compare(sum,rat(total))!==0)bad('Coverage durations do not partition the requested interval.');
        return {durations_ns:Object.fromEntries(Object.entries(durations).map(([k,v])=>[k,serial(v)])),
          entire_interval_contained_in_canvas:compare(durations.contained,rat(total))===0};
      });
      return {id:r.id,desktop_rect:r.desktop_rect,primary:lanes[0],backup:lanes[1]};
    });
    return {...common,summary_available:true,evaluated_segments:count,regions,
      limits:['Durations partition the entire requested half-open interval, independent of returned segment page size.',
        'Contained/clipped/outside describe affine canvas geometry only; no content presence, occlusion freedom, actor ownership or rescued-shot claim.',
        'Clipped duration does not measure how much of the content is missing; inspect per-frame canvas_area_fraction and actual source pixels.',
        'Unknown common clocks and incomplete journals remain unqualified buckets; valid frame candidates remain separate in segment pages.',
        'Buckets partition time in state_precedence order; an earlier unknown state can overlap later defects, which remain visible in segment pages.',
        'Entire-interval containment requires matched source, available declared affine and complete journal throughout; backup additionally requires a qualified common clock. Affines remain candidates outside independently tested geometry.']};
  }
  return {schema:'record-screen-paired-map/v1',clock_domain:'CLOCK_UPTIME_RAW',clock_alignment:{state:clockState,
    qualified:clockAligned,scope:'Same retained live recorder process only; no external-provider calibration or physical presentation proof.'},
    primary:metadata[0],backup:metadata[1],requested_interval:{basis:primaryRelative?'primary_relative':'recorder_host',
      ...(primaryRelative?{primary_relative_start_ns:request.primary_relative_start_ns,primary_relative_end_ns:request.primary_relative_end_ns}:{}),
      host_start_ns:String(start.n),host_end_ns:String(end.n)},
    timeline_qualification:clockAligned?'recorder_process_host_intervals':'numeric_candidate_only_unqualified_clock_alignment',
    segment_count:times.length-1,returned_segments:segments.length,has_more:stop<times.length-1,
    next_cursor:stop<times.length-1?`${token}:${stop}`:null,segments,
    ...(request.include_coverage_summary===true?{coverage_summary:coverageSummary()}:{}),
    limits:['Half-open actual mux intervals are split at both sources’ boundaries; dense backup samples survive held primary frames.',
      'Unknown packet duration, gaps, missing source matches and unqualified fitted positions remain explicit; no nearest-frame bridging.',
      'Legacy or different-process clock instances produce numeric candidates only, never qualified backup timing/projection.',
      'Retained process identity does not authenticate caller/actor ownership or calibrate another provider; observed clock gaps withhold alignment.',
      'Temporal and geometric availability do not prove visible content, successful recovery, same subject, occlusion freedom or adequate image quality.',
      'Held content and its exact source timestamp remain separate from packet presentation; signed content age may be negative during preroll.',
      'Cursor binds this interval, projections and file/metadata snapshot; every page rereads bounded sources and returns no bulk input rows.',
      'No capture, export, composition, input locking, peer restart or automatic mutation replay.']};
}
export async function mapRecordingPair(primary,backup,request) {
  request=validatePairedMapRequest(request);
  return withFrameSnapshots([primary,backup],s=>resolvePairedMap(s,request));
}
