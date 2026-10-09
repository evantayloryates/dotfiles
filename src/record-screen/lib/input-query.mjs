// Bounded retained-input readback. Metadata predicates are not actor inference.
import {open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {setImmediate as yieldLoop} from 'node:timers/promises';
import {performance} from 'node:perf_hooks';
import {EngineError} from './client.mjs';
import {retainedActionContext} from './action-context.mjs';
import {inputHealthContext,INPUT_HEALTH_NOTIFICATION_LIMITS} from './input-health-context.mjs';

const MAX_BYTES=64*1024*1024, MAX_ROWS=250000, MAX_LINE=1024*1024;
let active=false;
const fail=message=>{throw new EngineError('input_query',message)};
const bad=()=>{throw new EngineError('bad_input_query','Use an exact recording ID, bounded receipt interval and supported filters/cursor.')};
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const ownKeys=(v,keys)=>obj(v)&&Object.keys(v).every(k=>keys.includes(k));
const int=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const decimal=(v,signed=false)=>typeof v==='string'&&(signed?/^-?[0-9]{1,24}$/:/^[0-9]{1,24}$/).test(v);
const token=v=>typeof v==='string'&&/^act_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const digest=v=>createHash('sha256').update(v).digest('hex');
export const inputQueryHealth=()=>({active,max_journal_bytes:MAX_BYTES,max_rows:MAX_ROWS,max_page_events:256,health_notification_limits:INPUT_HEALTH_NOTIFICATION_LIMITS});
export const inputQuerySchema={type:'object',additionalProperties:false,properties:{
 recording_id:{type:'string',pattern:'^rec_[A-Za-z0-9]+$',maxLength:64},
 from_relative_ns:{type:'string',pattern:'^-?[0-9]{1,24}$'},
 to_relative_ns:{type:'string',pattern:'^-?[0-9]{1,24}$',description:'Exclusive recorder-reception offset; at most one hour per query.'},
 limit:{type:'integer',minimum:1,maximum:256,default:64},
 event_types:{type:'array',minItems:1,maxItems:32,uniqueItems:true,items:{type:'integer',minimum:0,maximum:255}},
 action_tokens:{type:'array',minItems:1,maxItems:16,uniqueItems:true,items:{type:'string',pattern:'^act_[0-9a-f-]{36}$'}},
 include_unassociated:{type:'boolean',default:true,description:'With an action filter, also retain events with no action token. Associations remain temporal/contextual, not ownership.'},
 include_context:{type:'boolean',default:false,description:'Return up to64 captured action snapshots overlapping this interval. Rich intent/context is caller supplied; bounds and results do not prove actors or visible changes.'},
 include_health_context:{type:'boolean',default:false,description:'Return bounded preceding/in-interval/untimed health notifications and retained protection snapshot counts independent of event filters. Historical observations are not continuous/live state or full input coverage.'},
 cursor:{type:'object',additionalProperties:false,properties:{after_row:{type:'integer',minimum:1,maximum:MAX_ROWS},snapshot_sha256:{type:'string',pattern:'^[0-9a-f]{64}$'},query_sha256:{type:'string',pattern:'^[0-9a-f]{64}$'}},required:['after_row','snapshot_sha256','query_sha256']},
},required:['recording_id','from_relative_ns','to_relative_ns']};
export function validateInputQuery(input){
 if(!ownKeys(input,Object.keys(inputQuerySchema.properties))||typeof input.recording_id!=='string'||input.recording_id.length>64||!/^rec_[A-Za-z0-9]+$/.test(input.recording_id)||!decimal(input.from_relative_ns,true)||!decimal(input.to_relative_ns,true))bad();
 const a={limit:64,include_unassociated:true,include_context:false,include_health_context:false,...input};
 const from=BigInt(a.from_relative_ns),to=BigInt(a.to_relative_ns);
 if(to<=from||to-from>3600000000000n||!int(a.limit,1,256)||typeof a.include_unassociated!=='boolean'||typeof a.include_context!=='boolean'||typeof a.include_health_context!=='boolean')bad();
 for(const [key,max,valid] of [['event_types',32,v=>int(v,0,255)],['action_tokens',16,token]]){
  if(a[key]!==undefined&&(!Array.isArray(a[key])||!a[key].length||a[key].length>max||a[key].some(v=>!valid(v))||new Set(a[key]).size!==a[key].length))bad();
 }
 if(input.include_unassociated===false&&!a.action_tokens)bad();
 if(a.cursor!==undefined&&(!ownKeys(a.cursor,['after_row','snapshot_sha256','query_sha256'])||!int(a.cursor.after_row,1,MAX_ROWS)||!['snapshot_sha256','query_sha256'].every(k=>typeof a.cursor[k]==='string'&&/^[0-9a-f]{64}$/.test(a.cursor[k]))))bad();
 return a;
}
const exact=(v,signed=false)=>{if(!decimal(v,signed))fail('Source contains an invalid exact clock/metadata integer.');return BigInt(v)};
const text=(v,max=256)=>{if(typeof v!=='string'||Buffer.byteLength(v)>max||/[\x00-\x1f]/.test(v))fail('Invalid bounded source metadata.');return v};
const list=(v,valid,max=16)=>{if(!Array.isArray(v)||v.length>max||v.some(x=>!valid(x)))fail('Invalid bounded source metadata list.');return [...v]};
const optionalInt=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>v===undefined||v===null?null:int(v,min,max)?v:fail('Invalid source numeric metadata.');
const optionalBool=v=>v===undefined||v===null?null:typeof v==='boolean'?v:fail('Invalid source boolean metadata.');
const optionalDecimal=v=>v===undefined||v===null?null:String(exact(v));
function normalizeEvent(row,epoch,ordinal){
 const received=exact(row.received_host_ns),relative=received-epoch;
 if(exact(row.relative_ns,true)!==relative||!int(row.type,0,255))fail('Input receipt clock/type disagrees with source epoch.');
 const keyboard=[10,11,12].includes(row.type);
 if(keyboard&&row.secure_input_snapshot===true)fail('Protected keyboard input appears in source; no event contents returned.');
 const actions=list(row.action_ids,token);
 const reasons=list(row.relevance_reasons,x=>typeof x==='string'&&Buffer.byteLength(x)<=128&&!/[\x00-\x1f]/.test(x));
 const event={source_row:ordinal,journal_sequence:optionalInt(row.journal_sequence),type:row.type,received_host_ns:String(received),relative_ns:String(relative),
  event_timestamp_ns:optionalDecimal(row.event_timestamp_ns),event_clock_qualification:'Raw provider CG timestamp; query offsets use recorder reception, not generation or physical presentation.',
  source_pid:optionalInt(row.source_pid,-2147483648,2147483647),destination_pid:optionalInt(row.destination_pid,-2147483648,2147483647),source_tag:row.source_tag===undefined?null:String(exact(row.source_tag,true)),
  flags:optionalDecimal(row.flags),window_under_pointer:optionalInt(row.window_under_pointer,0,4294967295),foreground_pid:optionalInt(row.foreground_pid,-2147483648,2147483647),
  callback_sequence:optionalDecimal(row.callback_sequence),callback_sequence_qualification:'Listener-instance receipt order; not a global deduplication key, provider completeness or actor identity.',scope_certainty:text(row.scope_certainty,128),relevance_reasons:reasons,action_tokens:actions,
  ownership:'unknown',action_association:'Context/receipt interval only; same-app unrelated activity can share these tokens.',
  context_snapshot_host_ns:optionalDecimal(row.context_snapshot_host_ns),window_context_snapshot_host_ns:optionalDecimal(row.window_context_snapshot_host_ns),
  window_context_stale:optionalBool(row.window_context_stale),window_context_snapshot_after_event:optionalBool(row.window_context_snapshot_after_event),
  input_queue_overflow_total:optionalInt(row.input_queue_overflow_total),secure_input_snapshot:optionalBool(row.secure_input_snapshot)};
 if(keyboard){event.key_code=optionalInt(row.key_code,0,65535);event.autorepeat=optionalBool(row.autorepeat)}
 else{
  const p=row.raw_position;
  if(!ownKeys(p,['x','y'])||!Number.isFinite(p.x)||!Number.isFinite(p.y))fail('Input raw position is not finite metadata.');
  event.raw_position={x:p.x,y:p.y};event.position_for_composition=null;event.position_qualification='Raw provider coordinates; no promotion, current-frame borrowing or pointer ownership inference.';
  event.button=optionalInt(row.button,-2147483648,2147483647);event.event_number=optionalInt(row.event_number,-2147483648,2147483647);
  if(row.delta!==undefined){if(!Array.isArray(row.delta)||row.delta.length!==2||row.delta.some(x=>!Number.isFinite(x)))fail('Invalid input delta.');event.delta=[...row.delta]}
  if(row.scroll!==undefined){const s=row.scroll;if(!ownKeys(s,['x','y','phase','momentum_phase','continuous'])||!Number.isFinite(s.x)||!Number.isFinite(s.y)||!int(s.phase)||!int(s.momentum_phase)||typeof s.continuous!=='boolean')fail('Invalid input scroll metadata.');event.scroll={x:s.x,y:s.y,phase:s.phase,momentum_phase:s.momentum_phase,continuous:s.continuous}}
 }
 return event;
}
const unchanged=(a,b)=>a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeMs===b.mtimeMs&&a.ctimeMs===b.ctimeMs;

export async function queryRecordingInput(descriptor,input){
 const a=validateInputQuery(input);
 if(active)throw new EngineError('input_query_busy','A retained-input read is active in this adapter; retry the read later.');
 if(descriptor?.recording_id!==a.recording_id||!['done','failed','interrupted','cancelled'].includes(descriptor.state))fail('Resolve the exact terminal recording before querying.');
 const path=descriptor.source_packet?.path;if(typeof path!=='string'||!path.startsWith('/'))fail('Engine must resolve an absolute journal path.');
 const canonical={recording_id:a.recording_id,from_relative_ns:String(BigInt(a.from_relative_ns)),to_relative_ns:String(BigInt(a.to_relative_ns)),limit:a.limit,include_unassociated:a.include_unassociated,event_types:a.event_types?[...a.event_types].sort((x,y)=>x-y):null,action_tokens:a.action_tokens?[...a.action_tokens].sort():null};
 if(a.include_context)canonical.include_context=true;
 if(a.include_health_context)canonical.include_health_context=true;
 const queryHash=digest(JSON.stringify(canonical));if(a.cursor&&a.cursor.query_sha256!==queryHash)fail('Cursor belongs to a different query; start a new read without it.');
 active=true;let handle;
 try{
  handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);const stat=await handle.stat();
  if(!stat.isFile()||stat.size<=0||stat.size>MAX_BYTES)fail('Journal violates the bounded regular-file contract.');
  const hash=createHash('sha256'),chunk=Buffer.alloc(65536),decoder=new TextDecoder('utf-8',{fatal:true});
  const events=[],gaps=[],contexts=[];let contextTotal=0,contextEligible=0,contextFiltered=0;
  let offset=0,pending='',rows=0,header=null,footer=null,scope=null,end=null,total=0,inInterval=0,eligible=0,afterCursor=0,typeFiltered=0,actionFiltered=0,more=false,gapCount=0,unknownGapTimes=0,intervalGapCount=0;
  const from=BigInt(a.from_relative_ns),to=BigInt(a.to_relative_ns),until=performance.now()+10000;
  const health=a.include_health_context?inputHealthContext(from,to):null;
  const rowValue=row=>{
   if(!obj(row))fail('Invalid source row object.');
   if(!header){if(row.kind!=='header'||row.schema!=='record-screen-source/v1'||row.recording_id!==a.recording_id||row.clock_domain!=='CLOCK_UPTIME_RAW'||row.epoch_host_ns!==descriptor.source_packet.epoch_host_ns)fail('Source identity/clock mismatch.');exact(row.epoch_host_ns);header=row;return}
   if(footer)fail('Rows follow a terminal source footer.');
   if(row.kind==='header')fail('Duplicate source header.');
   const epoch=exact(header.epoch_host_ns);
   health?.observeNotification(row,epoch,rows);
   if(row.kind==='footer'){if(row.schema!=='record-screen-source/v1'||row.epoch_host_ns!==header.epoch_host_ns||typeof row.complete!=='boolean')fail('Footer identity/completion metadata mismatch.');footer=row;return}
   if(row.kind==='input_scope'){scope={scope_pid:optionalInt(row.scope_pid,1,2147483647),scope_window_id:optionalInt(row.scope_window_id,1,4294967295),ambiguous_keys:text(row.ambiguous_keys,32),pointer_in_frame:optionalBool(row.pointer_in_frame),ownership:'unknown'};return}
   if(row.kind==='input_scope_end'){end={retained:optionalInt(row.retained),outside_scope_count:optionalInt(row.outside_scope_count),queue_overflow_during_scope:optionalInt(row.queue_overflow_during_scope)};return}
   if(row.kind==='action_scope'&&a.include_context){
    const c=retainedActionContext(row,epoch,rows,from,to);contextTotal++;
    if(!c.overlaps)return;
    if(a.action_tokens&&!a.action_tokens.includes(c.value.action_token)){contextFiltered++;return;}
    contextEligible++;if(contexts.length<64)contexts.push(c.value);return;
   }
   if(row.kind==='input_gap'){
    gapCount++;let relative=null;const raw=row.host_ns??row.received_host_ns;
    if(raw!==undefined){relative=exact(raw)-epoch;if(row.relative_ns!==undefined&&exact(row.relative_ns,true)!==relative)fail('Gap clock disagrees with source epoch.')}
    else if(row.relative_ns!==undefined)relative=exact(row.relative_ns,true);
    const relevant=relative===null||(relative>=from&&relative<to);
    if(relative===null)unknownGapTimes++;else if(relevant)intervalGapCount++;
    if(relevant&&gaps.length<32)gaps.push({source_row:rows,reason:text(row.reason,128),relative_ns:relative===null?null:String(relative),events_skipped:optionalInt(row.events_skipped),qualification:'Notification frontier, not the exact missing-event interval or ownership.'});return;
   }
   if(row.kind!=='input_event')return;
   const event=normalizeEvent(row,epoch,rows);health?.observeEvent(event);total++;const relative=BigInt(event.relative_ns);
   if(relative<from||relative>=to)return;inInterval++;
   if(a.event_types&&!a.event_types.includes(event.type)){typeFiltered++;return}
   if(a.action_tokens&&!event.action_tokens.some(t=>a.action_tokens.includes(t))&&!(a.include_unassociated&&!event.action_tokens.length)){actionFiltered++;return}
   eligible++;if(rows<=(a.cursor?.after_row??0))return;afterCursor++;
   if(events.length<a.limit)events.push(event);else more=true;
  };
  while(offset<stat.size){
   if(performance.now()>until)throw new EngineError('input_query_deadline','Journal exceeded the ten-second read budget; no mutation replay.');
   const {bytesRead}=await handle.read(chunk,0,Math.min(chunk.length,stat.size-offset),offset);if(!bytesRead)fail('Journal changed during read.');
   const bytes=chunk.subarray(0,bytesRead);hash.update(bytes);offset+=bytesRead;pending+=decoder.decode(bytes,{stream:true});let newline;
   while((newline=pending.indexOf('\n'))>=0){const line=pending.slice(0,newline);pending=pending.slice(newline+1);if(++rows>MAX_ROWS||Buffer.byteLength(line)>MAX_LINE)fail('Journal row/line budget exceeded.');if(line.trim()){let row;try{row=JSON.parse(line)}catch{fail('Malformed source row; contents not returned.')}rowValue(row)}}
   if(Buffer.byteLength(pending)>MAX_LINE)fail('Journal line budget exceeded.');await yieldLoop();
  }
  pending+=decoder.decode();if(pending.trim())fail('Unterminated source row; no partial query returned.');
  if(!header||!unchanged(stat,await handle.stat()))fail('No stable opened source snapshot.');
  const snapshotHash=hash.digest('hex');if(a.cursor&&a.cursor.snapshot_sha256!==snapshotHash)fail('Journal snapshot changed between pages; start a new read.');
  if(a.cursor&&a.cursor.after_row>rows)fail('Cursor is outside this source snapshot.');
  const result={schema:'record-screen-input-query/v1',recording_id:a.recording_id,recording_state:descriptor.state,clock_domain:'CLOCK_UPTIME_RAW',epoch_host_ns:header.epoch_host_ns,
   interval:{from_relative_ns:canonical.from_relative_ns,to_relative_ns:canonical.to_relative_ns,end_exclusive:true,clock:'recorder_reception'},filters:{event_types:canonical.event_types,action_tokens:canonical.action_tokens,include_unassociated:canonical.include_unassociated},
   events,next_cursor:more?{after_row:events.at(-1).source_row,snapshot_sha256:snapshotHash,query_sha256:queryHash}:null,
   selection:{order:'source_journal_row_order; not provider generation order',total_retained_events:total,events_in_interval:inInterval,type_filtered:typeFiltered,action_filtered:actionFiltered,eligible_events:eligible,eligible_after_cursor:afterCursor,page_events:events.length},
   coverage:{journal_complete:footer?.complete===true&&footer.rows_lost===0&&descriptor.source_packet.complete===true,footer_present:footer!==null,rows_lost:footer?optionalInt(footer.rows_lost):null,source_rows_inspected:rows,input_scope:scope,input_scope_end:end,
    gap_notifications_total:gapCount,gap_notifications_in_interval:intervalGapCount,gaps_with_unknown_time:unknownGapTimes,gaps,gap_details_truncated:intervalGapCount+unknownGapTimes>gaps.length,input_delivery_completeness:'unproven',video_coverage_evaluated:false,
    completeness_qualification:'Journal completion and observed counts never prove full input delivery, video coverage or actor identity.',clock_continuity:'Inspect recording_source for source clock anchors/gaps; reception offsets do not calibrate sleep or external provider clocks.'},
   snapshot:{sha256:snapshotHash,query_sha256:queryHash,bytes:stat.size,consistency:'Opened regular leaf unchanged across read; no filesystem lock or global adapter admission.'},
   limits:['Query only sees capture-retained events; filtered/outside-scope events cannot be recovered from counts.','Broad same-app keyboard coverage is intentional; delivery/window/action clues do not authenticate the human or agent.','Action tokens are contextual associations; unrelated same-app activity during the block can also match.','Reception offsets are exact in the recorder domain; raw CG generation stamps and coordinates remain separately unqualified.','Use recording_frame_map for actual media coverage; input presence does not establish a visible or decodable frame.']};
  if(a.include_context)result.captured_context={updates:contexts,selection:{total_source_updates:contextTotal,eligible_updates:contextEligible,action_filtered:contextFiltered,returned_updates:contexts.length,truncated:contextEligible>contexts.length},
    pagination:'Bounded context summary repeats on input pages; identify snapshots by source_row. Not a context-pagination cursor.',
    limits:['Only captured source snapshots; actions begun/ended outside capture or lost rows can be absent. Absence does not mean no action.',
      'Input event-type filters do not hide context. Action-token filters apply; include_unassociated is for input events only.',
      'Intent/context are caller-authored; claimed results are not separate verification or cleanup outcomes. Use shared typed outcomes for those.',
      'Use exact start/end relative offsets with recording_frame_map for media; no visible-change, physical latency or ownership inference.']};
  if(health)result.input_health_context=health.summary();
  if(Buffer.byteLength(JSON.stringify(result))>1024*1024)fail('Input query response exceeded1MiB; request a smaller page or narrower context interval.');return result;
 }finally{try{await handle?.close()}finally{active=false}}
}
