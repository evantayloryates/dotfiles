// First bounded, editable cursor recipe. Native-pointer suppression belongs to
// capture; app-drawn cursors/carets are not erased by this renderer.
import{open,mkdir,writeFile,rm,readFile}from'node:fs/promises';
import{constants}from'node:fs';
import{randomUUID,createHash}from'node:crypto';
import{fileURLToPath}from'node:url';
import{join}from'node:path';
import{spawn}from'node:child_process';
import{EngineError,enginePaths}from'./client.mjs';
import{buildFrameIndex,withFrameSnapshots}from'./frame-map.mjs';
import{clockIdentity}from'./paired-map.mjs';
const fail=m=>{throw new EngineError('cursor_render',m)};
// Key activity is only a presentation heuristic, never proof of text entry.
// Escape and Command/Control shortcuts must not hide the pointer as typing.
function typingCandidate(e){
 if(e.key_code===53)return false;
 if(/^[0-9]{1,20}$/.test(String(e.flags??''))){const flags=BigInt(e.flags);if(flags&((1n<<20n)|(1n<<18n)))return false}
 return true; // Preserve legacy unknown-key behavior; no text/layout inference.
}
const keys=['recording_id','asset_path','hotspot','size_px','opacity','effort','from_s','to_s','fps','max_width','max_hold_ms','idle_policy','click_ms','hide_on_typing','source_rows','action_tokens','coordinate_basis'];
export const cursorRenderSchema={type:'object',additionalProperties:false,properties:{recording_id:{type:'string'},asset_path:{type:'string',description:'Absolute local SVG with no external resources, or PNG. Asset is frozen privately with its hash.'},hotspot:{type:'array',minItems:2,maxItems:2,items:{type:'number'},description:'Required x,y in original asset viewBox/pixels; cursor.svg test tip is near [0.23,4.14]. This is a style choice, not an inferred calibration.'},size_px:{type:'number',minimum:8,maximum:256,default:42},opacity:{type:'number',minimum:0,maximum:1,default:1},effort:{type:'string',enum:['draft','final'],default:'draft'},from_s:{type:'number',minimum:0},to_s:{type:'number',minimum:0},fps:{type:'integer',minimum:1,maximum:60},max_width:{type:'integer',minimum:64,maximum:1920},max_hold_ms:{type:'number',minimum:0,maximum:10000,default:1000},idle_policy:{type:'string',enum:['expire','hold_last'],default:'expire',description:'expire uses max_hold_ms. hold_last retains the last recorded position through idle time; no interpolation or initial backfill. Input gaps interrupt the hold. A presentation choice, not proof of continuous motion.'},click_ms:{type:'number',minimum:0,maximum:1000,default:180},hide_on_typing:{type:'boolean',default:true,description:'Key-activity presentation heuristic; excludes Escape and Command/Control shortcuts. Other/unknown keys can hide until the next pointer event; does not prove text entry.'},source_rows:{type:'array',minItems:1,maxItems:20000,items:{type:'integer',minimum:1}},action_tokens:{type:'array',minItems:1,maxItems:16,items:{type:'string'}},coordinate_basis:{type:'string',const:'acknowledged_recorder_desktop_candidate',description:'Explicitly acknowledge raw event coordinates use the tested desktop convention for this take. No provider/actor proof is inferred. Verify representative rendered frames.'}},required:['recording_id','asset_path','hotspot','coordinate_basis']};
export function validateCursorRecipe(a){
 if(!a||typeof a!=='object'||Array.isArray(a)||Object.keys(a).some(k=>!keys.includes(k))||!/^rec_[A-Za-z0-9]+$/.test(a.recording_id)||typeof a.asset_path!=='string'||!a.asset_path.startsWith('/')||a.asset_path.length>4096||a.coordinate_basis!=='acknowledged_recorder_desktop_candidate')fail('Use an exact recording, absolute asset and explicit coordinate_basis acknowledgement.');
 const r={size_px:42,opacity:1,effort:'draft',from_s:0,max_hold_ms:1000,idle_policy:'expire',click_ms:180,hide_on_typing:true,...a};
 if(!['expire','hold_last'].includes(r.idle_policy)||!['draft','final'].includes(r.effort)||!Array.isArray(r.hotspot)||r.hotspot.length!==2||r.hotspot.some(n=>!Number.isFinite(n)||n<0||n>16384)||typeof r.hide_on_typing!=='boolean')fail('Invalid cursor hotspot, effort or typing setting.');
 r.fps??=r.effort==='draft'?15:30;r.max_width??=r.effort==='draft'?640:1280;
 for(const[k,lo,hi,integer]of[['size_px',8,256],['opacity',0,1],['fps',1,60,true],['max_width',64,1920,true],['max_hold_ms',0,10000],['click_ms',0,1000],['from_s',0,10800]])if(!Number.isFinite(r[k])||r[k]<lo||r[k]>hi||integer&&!Number.isInteger(r[k]))fail('Invalid '+k);
 if(r.to_s!==undefined&&(!Number.isFinite(r.to_s)||r.to_s<=r.from_s||r.to_s-r.from_s>60))fail('Select at most60 seconds with to_s after from_s.');
 if(r.source_rows!==undefined&&(!Array.isArray(r.source_rows)||!r.source_rows.length||r.source_rows.length>20000||r.source_rows.some(x=>!Number.isSafeInteger(x)||x<1)||new Set(r.source_rows).size!==r.source_rows.length))fail('Invalid selected source rows.');
 if(r.action_tokens!==undefined&&(!Array.isArray(r.action_tokens)||!r.action_tokens.length||r.action_tokens.length>16||r.action_tokens.some(x=>!/^act_[a-f0-9-]{36}$/.test(x))))fail('Invalid action tokens.');
 return r;
}
export function buildCursorTimeline(snapshot,recipe){
 const index=buildFrameIndex(snapshot.descriptor,snapshot.rows,snapshot.probe);
 const clock=clockIdentity(index.header,snapshot.descriptor),continuity=snapshot.descriptor.source_packet?.clock_continuity;
 if(!clock.instance||continuity?.observed_gaps!==0||continuity?.sample_unbounded!==false)fail("Retained recorder clock/continuity is unqualified; no cursor timing was guessed.");
 if(index.packets.length>7200)fail('First recipe supports source takes up to7200 actual frames; trim with the recorder export workflow first.');
 const size=index.map({recording_id:recipe.recording_id,frame_indices:[0]}).muxed_canvas_pixels;
 if(!size||size[0]*size[1]>16777216)fail('Missing or oversized source canvas.');
 const end=index.packets.at(-1).end;if(!end)fail('Unmeasured video end.');
 const endNs=BigInt(end.numerator)/BigInt(end.denominator),from=BigInt(Math.round(recipe.from_s*1e9)),to=recipe.to_s===undefined?endNs:BigInt(Math.round(recipe.to_s*1e9));
 if(to> endNs||to<=from||to-from>60000000000n)fail('Recipe interval must fit measured video coverage and last at most60 seconds.');
 const events=snapshot.rows.map((r,i)=>({...r,source_row:r._source_row??i+1})).filter(r=>r.kind==='input_event'&&(!recipe.source_rows||recipe.source_rows.includes(r.source_row))&&(!recipe.action_tokens||r.action_ids?.some(x=>recipe.action_tokens.includes(x))));
 if(events.length>20000)fail('Select fewer input rows/action tokens; maximum20000.');
 const gaps=[];
 for(const row of snapshot.rows){
  if(row.kind!=='input_gap'&&!(row.kind==='input_listener'&&row.state!=='listening'))continue;
  const raw=row.host_ns??row.received_host_ns;
  let ns;if(raw!==undefined&&/^\d{1,24}$/.test(String(raw)))ns=BigInt(raw)-index.epoch;
  else if(/^-?\d{1,24}$/.test(String(row.relative_ns??'')))ns=BigInt(row.relative_ns);
  else fail('Input interruption has no exact time; no cursor hold was guessed.');
  if(row.relative_ns!==undefined&&String(ns)!==String(row.relative_ns))fail('Input interruption epoch mismatch.');
  gaps.push(ns);
 }
 gaps.sort((a,b)=>a<b?-1:a>b?1:0);
 if(recipe.idle_policy==='hold_last'&&!index.map({recording_id:recipe.recording_id,frame_indices:[0]}).mux_source_correspondence.journal_complete)fail('Holding idle positions requires a complete loss-free source journal.');
 const motions=[],clicks=[],keys=[];
 for(const e of events){if(!/^\d{1,24}$/.test(e.received_host_ns)||!/^-?\d{1,24}$/.test(e.relative_ns))fail('Missing exact input clock.');const ns=BigInt(e.relative_ns);if(BigInt(e.received_host_ns)-index.epoch!==ns)fail('Input epoch mismatch.');
  if([10,11].includes(e.type)){if(typingCandidate(e))keys.push(ns);continue}
  if(![1,2,3,4,5,6,7,22,25,26,27].includes(e.type))continue;
  if(!Number.isFinite(e.raw_position?.x)||!Number.isFinite(e.raw_position?.y))fail('Invalid pointer position.');
  const p={ns,x:e.raw_position.x,y:e.raw_position.y,source_row:e.source_row};motions.push(p);if([1,3,25].includes(e.type))clicks.push(p);
 }
 motions.sort((a,b)=>a.ns<b.ns?-1:a.ns>b.ns?1:0);clicks.sort((a,b)=>a.ns<b.ns?-1:a.ns>b.ns?1:0);keys.sort((a,b)=>a<b?-1:a>b?1:0);
 if(!motions.length)fail('No selected retained pointer positions; choose another take or event selection.');
 const outputWidth=Math.min(recipe.max_width,size[0])&~1,outputHeight=Math.max(2,Math.round(size[1]*outputWidth/size[0])&~1),scale=outputWidth/size[0];
 if(outputWidth*outputHeight>2073600)fail('Output canvas exceeds first-recipe2MP budget; lower max_width.');
 const frames=[];let mi=-1,ki=-1,ci=-1,gi=-1;
 const frameCount=Number(((to-from)*BigInt(recipe.fps)+999999999n)/1000000000n);
 for(let n=0;n<frameCount;n++){
  const numerator=from*BigInt(recipe.fps)+BigInt(n)*1000000000n,t=numerator/BigInt(recipe.fps);
  const m=index.map({recording_id:recipe.recording_id,relative_ns:[String(t)]}).mapped[0];
  if(!m.included||!m.metadata_available||!m.transform_available)fail('Recipe encounters unavailable media/geometry: '+(m.reason||m.transform_reason||'unknown'));
  while(mi+1<motions.length&&motions[mi+1].ns<=t)mi++;while(ki+1<keys.length&&keys[ki+1]<=t)ki++;while(ci+1<clicks.length&&clicks[ci+1].ns<=t)ci++;
  while(gi+1<gaps.length&&gaps[gi+1]<=t)gi++;
  const p=motions[mi],interrupted=p&&gi>=0&&gaps[gi]>=p.ns,recent=p&&!interrupted&&(recipe.idle_policy==='hold_last'||t-p.ns<=BigInt(Math.round(recipe.max_hold_ms*1e6))),typing=recipe.hide_on_typing&&ki>=0&&p&&keys[ki]>p.ns;
  const matrix=m.geometry.desktop_points_to_source_pixels;
  const project=p=>({x:(matrix[0]*p.x+matrix[2]*p.y+matrix[4])*scale,y:(matrix[1]*p.x+matrix[3]*p.y+matrix[5])*scale});
  const c=clicks[ci],age=c?Number(t-c.ns)/1e6:null;
  frames.push({output_frame:n,source_frame_index:m.frame_index,video_time_ns:{numerator:String(numerator),denominator:String(recipe.fps)},source_content_relative_ns:m.source_content_relative_ns,held:m.held,pointer_position_age_ns:p?String(t-p.ns):null,pointer_absence:!p?'no_prior_position':interrupted?'input_interruption':!recent?'hold_expired':typing?'typing_hide':null,pointer:recent&&!typing?{...project(p),source_row:p.source_row}:null,click:c&&!(gi>=0&&gaps[gi]>=c.ns)&&age>=0&&age<recipe.click_ms?{...project(c),progress:age/recipe.click_ms,source_row:c.source_row}:null});
 }
 const positioned=frames.filter(f=>f.pointer),missing={no_prior_position:0,hold_expired:0,typing_hide:0,input_interruption:0};
 let run=0,longest=0;for(const f of frames){if(f.pointer){run=0}else{missing[f.pointer_absence]++;longest=Math.max(longest,++run)}}
 const coverage={output_frames:frames.length,positioned_frames:positioned.length,unpositioned_frames:frames.length-positioned.length,positioned_fraction:positioned.length/frames.length,first_position_output_s:positioned.length?positioned[0].output_frame/recipe.fps:null,longest_unpositioned_s:longest/recipe.fps,absence_frames_by_reason:missing,outside_canvas_frames:positioned.filter(f=>f.pointer.x<0||f.pointer.y<0||f.pointer.x>=outputWidth||f.pointer.y>=outputHeight).length,idle_policy:recipe.idle_policy??'expire',held_beyond_max_hold_frames:positioned.filter(f=>BigInt(f.pointer_position_age_ns)>BigInt(Math.round(recipe.max_hold_ms*1e6))).length,qualification:'Counts timeline positions, not visible cursor pixels or continuous physical motion. Idle policy explicitly expires or holds the last recorded position; input interruptions invalidate prior positions. No initial backfill or trajectory is invented. Typing hide is a key-activity heuristic; Escape and Command/Control shortcuts are excluded, unknown keys retain legacy behavior.'};
 const warnings=[];
 if(coverage.held_beyond_max_hold_frames)warnings.push(`${coverage.held_beyond_max_hold_frames} frames hold the last observed position beyond max_hold_ms by explicit idle_policy=hold_last; this is presentation, not measured continuous motion.`);
 if(coverage.unpositioned_frames)warnings.push(`${coverage.unpositioned_frames}/${coverage.output_frames} output frames have no cursor position; inspect pointer_coverage reasons before using this render.`);
 if(coverage.outside_canvas_frames)warnings.push('Some cursor anchors fall outside the output canvas.');
 if(recipe.opacity===0)warnings.push('Cursor opacity is zero; positioned frames do not imply a visible cursor.');
 return{schema:'smart-record-cursor-timeline/v1',pointer_coverage:coverage,warnings,clock_instance:clock.instance,source_pixels:size,output_pixels:[outputWidth,outputHeight],fps:recipe.fps,from_ns:String(from),to_ns:String(to),frames,events_selected:events.length,position_qualification:'Caller acknowledged recorded desktop convention. Affine is available under existing fitting guards; inspect representative pixels. No actor inference, physical latency or provider calibration.',timing_qualification:'Service resamples measured primary packet coverage at exact rational output times using recorder-reception input offsets. Output cadence is not input/device latency. No interpolation or invented source pictures.'};
}
function runRenderer(python,job,fd){return new Promise((resolve,reject)=>{
 const p=spawn(python,[fileURLToPath(new URL('../render-cursor.py',import.meta.url))],{stdio:['pipe','pipe','pipe',fd],detached:true});let out='',err='';
 const kill=()=>{try{process.kill(-p.pid,'SIGKILL')}catch{}};const timer=setTimeout(kill,180000);
 p.stdout.on('data',b=>{out+=b;if(out.length>1048576)kill()});p.stderr.on('data',b=>{err+=b;if(err.length>65536)kill()});p.on('error',e=>{clearTimeout(timer);reject(e)});p.on('close',code=>{clearTimeout(timer);if(code!==0)return reject(new EngineError('cursor_render_worker','Renderer failed; private artifacts retained. '+err.slice(-600)));try{resolve(JSON.parse(out))}catch{reject(new EngineError('cursor_render_worker','Renderer returned no valid receipt.'))}});p.stdin.end(JSON.stringify(job));
})}
export async function renderCursor(descriptor,input){
 const recipe=validateCursorRecipe(input);
 if(descriptor.recording_id!==recipe.recording_id)fail('Recording identity mismatch.');
 const base=join(enginePaths().root,'composites');await mkdir(base,{recursive:true,mode:0o700});const lock=join(base,'.render-lock');
 try{await mkdir(lock,{mode:0o700})}catch(e){if(e.code==='EEXIST')fail('Another render holds the shared admission lock. If its process disappeared, inspect before explicitly clearing the stale lock.');throw e}
 const output=join(base,'cmp_'+randomUUID().replaceAll('-','').slice(0,20));let asset;
 try{
  await writeFile(join(lock,'owner.json'),JSON.stringify({pid:process.pid,at:new Date().toISOString()}),{mode:0o600});await mkdir(output,{mode:0o700});
  asset=await open(recipe.asset_path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);const stat=await asset.stat();if(!stat.isFile()||stat.size<=0||stat.size>1048576)fail('Asset must be a regular local file under1MiB.');const bytes=await asset.readFile();
  const svg=bytes.subarray(0,100).toString().includes('<svg')||bytes.toString('utf8',0,200).includes('<?xml');if(svg&&/\b(?:href|src)\s*=|url\s*\(|@import|<!DOCTYPE|<!ENTITY/i.test(bytes.toString()))fail('SVG external resources/entities are unsupported. Use a self-contained path asset.');
  const assetPath=join(output,svg?'cursor.svg':'cursor.png');await writeFile(assetPath,bytes,{mode:0o600});
  const result=await withFrameSnapshots([descriptor],async(s,fds)=>{
   const timeline=buildCursorTimeline(s[0],recipe);await writeFile(join(output,'recipe.json'),JSON.stringify({schema:'smart-record-cursor-recipe/v1',...recipe,asset_sha256:createHash('sha256').update(bytes).digest('hex'),source_snapshot:s[0].files,limits:['No removal of app-drawn cursor/caret; inspect clean source footage.','Original video is untouched. Output is a silent SDR H.264 derivative; audio/HDR conversion are outside this first recipe.','Draft and final differ in cadence/size/encoding effort; raw events and recipe remain editable.']},null,2),{mode:0o600});await writeFile(join(output,'timeline.json'),JSON.stringify(timeline),{mode:0o600});
   const python=fileURLToPath(new URL('../../../data/smart-record/render-venv/bin/python',import.meta.url));return runRenderer(python,{output,asset_path:assetPath,recipe,timeline},fds[0]);
  },{includeInput:true});
  return{...result,interface_lifecycle:'provisional_composition',recording_id:recipe.recording_id,recipe_path:join(output,'recipe.json'),timeline_path:join(output,'timeline.json'),original_unchanged:true,qualification:'One configurable cursor/click recipe. Verify returned sample frames; candidate provider coordinates were explicitly acknowledged. No automatic ownership, cursor-erasure or universal geometry guarantee.'};
 }finally{await asset?.close();await rm(lock,{recursive:true,force:true})}
}
