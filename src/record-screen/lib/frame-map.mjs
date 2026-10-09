// Service-owned exact primary-media/source mapping. No capture, export or UI.
import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawn } from 'node:child_process';
import { setImmediate as yieldLoop } from 'node:timers/promises';
import { EngineError } from './client.mjs';
import { MAX_REGIONS, regionSchema, validateRegions, projectRegions } from './region-map.mjs';

const fail = (code, message) => { throw new EngineError(code, message); };
const mapping = message => fail('frame_mapping', message);
const MAX_PACKETS = 120000, MAX_ROWS = 250000, MAX_JOURNAL = 64 * 1024 * 1024;
let running = false, probeState = null;
export const frameMapHealth = () => ({ active: running, probe: probeState ? { ...probeState } : null,
  max_packets: MAX_PACKETS, max_rows: MAX_ROWS, max_journal_bytes: MAX_JOURNAL, max_regions: MAX_REGIONS });

export const frameMapSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    recording_id: { type: 'string', maxLength:64, pattern: '^rec_[A-Za-z0-9]+$' },
    frame_indices: { type: 'array', minItems: 1, maxItems: 64, items: { type: 'integer', minimum: 0, maximum: MAX_PACKETS-1 }, description: 'Zero-based presentation order of actual mux packets; not accepted writer decisions.' },
    relative_ns: { type: 'array', minItems: 1, maxItems: 64, items: { type: 'string', pattern: '^-?[0-9]{1,24}$' }, description: 'Exact primary-video offsets; explicit exclusion outside packet intervals.' },
    host_ns: { type:'array', minItems:1, maxItems:64, items:{type:'string',pattern:'^[0-9]{1,24}$'}, description:'Recorder-domain host stamps; service subtracts the exact epoch. Requires clock_domain.' },
    clock_domain: { type:'string',enum:['CLOCK_UPTIME_RAW'],description:'Required with host_ns; declaring it does not calibrate an external provider clock.' },
    desktop_points: { type: 'array', maxItems: 16, items: { type: 'object', additionalProperties: false,
      properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'] } },
    desktop_regions: regionSchema,
  }, required: ['recording_id'], oneOf: [{ required: ['frame_indices'] }, { required: ['relative_ns'] }, { required: ['host_ns','clock_domain'] }],
};
export function validateFrameMapRequest(input) {
  const bad = () => fail('bad_frame_map', 'Use recording_id and exactly one of frame_indices/relative_ns/host_ns (1–64); host_ns requires clock_domain=CLOCK_UPTIME_RAW. Optional desktop_points:0–16 finite x/y pairs.');
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(k => !['recording_id','frame_indices','relative_ns','host_ns','clock_domain','desktop_points','desktop_regions'].includes(k)) ||
      typeof input.recording_id !== 'string' || input.recording_id.length > 64 || !/^rec_[A-Za-z0-9]+$/.test(input.recording_id) ||
      [input.frame_indices,input.relative_ns,input.host_ns].filter(x=>x!==undefined).length !== 1 ||
      (input.host_ns !== undefined ? input.clock_domain !== 'CLOCK_UPTIME_RAW' : input.clock_domain !== undefined)) bad();
  const queries = input.frame_indices ?? input.relative_ns ?? input.host_ns;
  if (!Array.isArray(queries) || !queries.length || queries.length > 64 || queries.some(v => input.frame_indices !== undefined
    ? !Number.isInteger(v) || v < 0 || v >= MAX_PACKETS : typeof v !== 'string' || !(input.host_ns ? /^[0-9]{1,24}$/ : /^-?[0-9]{1,24}$/).test(v))) bad();
  const points = input.desktop_points ?? [];
  if (!Array.isArray(points) || points.length > 16 || points.some(p => !p || typeof p !== 'object' || Array.isArray(p) ||
      Object.keys(p).length !== 2 || !Number.isFinite(p.x) || !Number.isFinite(p.y))) bad();
  return { ...input, desktop_points: points, desktop_regions: validateRegions(input.desktop_regions) };
}
const exact = value => {
  if (typeof value === 'string' && /^-?[0-9]{1,24}$/.test(value)) return BigInt(value);
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  mapping('Unsafe or missing exact integer in source/media metadata.');
};
function ratio(n, d) {
  if (d <= 0n) mapping('Invalid media denominator.');
  let a = n < 0n ? -n : n, b = d;
  while (b) [a, b] = [b, a % b];
  const g = a || 1n;
  return { numerator: String(n/g), denominator: String(d/g) };
}
const identity = r => `${r.numerator}/${r.denominator}`;
const validID = n => Number.isSafeInteger(n) && n >= 0;

/** Operates on bounded snapshots. Input events are never returned. */
export function buildFrameIndex(descriptor, rows, probe) {
  if (typeof descriptor?.recording_id !== 'string' || !/^rec_[A-Za-z0-9]+$/.test(descriptor.recording_id) || !['done','failed','interrupted','cancelled'].includes(descriptor.state)) mapping('Only the resolved terminal recording can be mapped.');
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > MAX_ROWS) mapping('Source row budget exceeded or empty.');
  const header = rows[0];
  if (header.kind !== 'header' || header.schema !== 'record-screen-source/v1' || header.recording_id !== descriptor.recording_id ||
      header.clock_domain !== 'CLOCK_UPTIME_RAW' || header.epoch_host_ns !== descriptor.source_packet?.epoch_host_ns) mapping('Source identity/epoch mismatch.');
  const epoch = exact(header.epoch_host_ns);
  // record.source intentionally omits the full manifest. Use the retained
  // capture/header scope, not only record.get fields supplied by some callers.
  const capture = rows.find(row => row.kind === 'capture')?.resolved;
  const target = header.target ?? descriptor.target;
  const sources = new Map(), geometries = new Map(), accepted = new Map();
  const sequences = new Set();
  let acceptedCount = 0, footer = null;
  for (const row of rows) {
    if (row.kind === 'source_frame') {
      if (!validID(row.source_frame) || sources.has(row.source_frame)) mapping('Invalid or duplicate source identity.');
      sources.set(row.source_frame, row);
    } else if (row.kind === 'geometry') {
      if (!validID(row.segment) || geometries.has(row.segment)) mapping('Invalid or duplicate geometry identity.');
      geometries.set(row.segment, row.geometry);
    } else if (row.kind === 'encoded_frame' && row.accepted === true) {
      const ns = exact(row.relative_ns), key = identity(ratio(ns, 1n));
      if (row.host_ns !== undefined && exact(row.host_ns) !== epoch+ns) mapping('Accepted host/video clocks disagree.');
      if (!validID(row.encoded_sequence) || sequences.has(row.encoded_sequence) || accepted.has(key) || acceptedCount >= MAX_PACKETS) mapping('Invalid/duplicate accepted identity or submission budget exceeded.');
      sequences.add(row.encoded_sequence);
      accepted.set(key, row); acceptedCount++;
    } else if (row.kind === 'footer') {
      if (footer || row !== rows.at(-1)) mapping('Source footer is not uniquely terminal.');
      footer = row;
    }
  }
  const base = probe?.streams?.[0]?.time_base;
  if (typeof base !== 'string' || !/^[0-9]+\/[0-9]+$/.test(base)) mapping('Missing exact media time base.');
  const [num, den] = base.split('/').map(BigInt);
  if (num <= 0n || den <= 0n || !Array.isArray(probe.packets) || !probe.packets.length || probe.packets.length > MAX_PACKETS) mapping('Missing or oversized actual packet table.');
  const packets = probe.packets.map((p, index) => ({ mux_packet_index: index, ticks: exact(p.pts),
    duration: p.duration === undefined ? null : exact(p.duration) }));
  packets.sort((a,b) => a.ticks < b.ticks ? -1 : a.ticks > b.ticks ? 1 : 0);
  if (packets.some((p,i) => i && p.ticks <= packets[i-1].ticks)) mapping('Ambiguous or duplicate presentation timestamps.');
  const muxPixels = [probe.streams[0].width,probe.streams[0].height];
  const muxCanvasKnown = muxPixels.every(v => Number.isInteger(v) && v > 0 && v <= 16384);
  let matches = 0, references = 0;
  const matchedTimes = new Set();
  for (let i = 0; i < packets.length; i++) {
    const p = packets[i];
    p.start = ratio(p.ticks * num * 1000000000n, den);
    // Actual duration bounds coverage. A later sample caps an overlapping tag;
    // a shorter tag leaves an explicit hole, never invented held coverage.
    const declaredEnd = p.duration !== null && p.duration > 0n ? p.ticks+p.duration : null;
    const next = packets[i+1]?.ticks;
    const end = declaredEnd === null ? null : next !== undefined && next < declaredEnd ? next : declaredEnd;
    p.end = end === null ? null : ratio(end * num * 1000000000n, den);
    p.accepted = accepted.get(identity(p.start));
    if (p.accepted) {
      matches++; matchedTimes.add(identity(p.start));
      p.source = sources.get(p.accepted.source_frame);
      p.geometry = p.source && geometries.get(p.source.geometry_segment);
      if (p.source && p.geometry) references++;
    }
  }
  const journalComplete = descriptor.source_packet?.complete === true && descriptor.source_packet?.rows_lost === 0 &&
    footer?.complete === true && footer?.rows_lost === 0;
  function atOffset(text, request) {
    const ns = exact(text);
    let lo = 0, hi = packets.length;
    while (lo < hi) {
      const mid = Math.floor((lo+hi)/2), p = packets[mid];
      if (p.ticks*num*1000000000n <= ns*den) lo = mid+1; else hi = mid;
    }
    const index = lo-1, p = packets[index];
    if (!p) return { included: false, reason: 'before_first_muxed_packet' };
    if (!p.end) return { included: false, reason: index === packets.length-1 ? 'unmeasured_last_packet_end' : 'unmeasured_packet_end' };
    if (ns*BigInt(p.end.denominator) >= BigInt(p.end.numerator)) return { included: false, reason: index === packets.length-1 ? 'at_or_after_muxed_video_end' : 'between_measured_packet_intervals' };
    return project(p,index,request);
  }
  function project(p, index, request) {
    if (!p) return { included: false, reason: 'frame_index_outside_muxed_video' };
    const result = { included: true, frame_index: index, mux_packet_index: p.mux_packet_index,
      video_start_ns: p.start, video_end_ns: p.end, metadata_available: false };
    if (!p.accepted) return { ...result, reason: 'mux_packet_has_no_exact_journal_match' };
    if (!p.source || !p.geometry) return { ...result, reason: 'missing_source_or_geometry_reference', accepted_sequence: p.accepted.encoded_sequence };
    const matrix = p.geometry.desktop_points_to_source_pixels;
    const pixels = p.geometry.source_pixels;
    const affineValid = Array.isArray(matrix) && matrix.length === 6 && matrix.every(Number.isFinite) &&
      Number.isFinite(matrix[0]*matrix[3]-matrix[1]*matrix[2]) && matrix[0]*matrix[3]-matrix[1]*matrix[2] !== 0 &&
      Array.isArray(pixels) && pixels.length === 2 && pixels.every(v => Number.isInteger(v) && v > 0 && v <= 16384);
    const canvasMatches = muxCanvasKnown && pixels?.[0] === muxPixels[0] && pixels?.[1] === muxPixels[1];
    // SCK can fit a child-window union into the fixed window canvas without
    // declaring that union's desktop origin. The real TextEdit tall-menu lane
    // fails pixel alignment even with a finite affine and matching canvas.
    // Preserve its metadata/timing, but do not project unqualified positions.
    const windowCapture = capture?.kind === 'window' || target?.type === 'window' || descriptor.resolved?.kind === 'window';
    const children = capture?.capture_options?.include_child_windows_effective ??
      descriptor.resolved?.capture_options?.include_child_windows_effective ?? target?.include_child_windows;
    const fittedChildren = windowCapture && children !== false &&
      Number.isFinite(p.geometry.content_scale) && p.geometry.content_scale !== 1;
    const transform = affineValid && canvasMatches && !fittedChildren;
    const sourceTime = p.source.pts_host_ns === null || p.source.pts_host_ns === undefined ? null : String(exact(p.source.pts_host_ns)-epoch);
    const points = transform ? request.desktop_points.map(({x,y}) => {
      const sx = matrix[0]*x+matrix[2]*y+matrix[4], sy = matrix[1]*x+matrix[3]*y+matrix[5];
      if (!Number.isFinite(sx) || !Number.isFinite(sy)) mapping('Projected point is not finite.');
      return { desktop: {x,y}, source_pixels: {x:sx,y:sy}, inside_encoded_canvas: sx >= 0 && sy >= 0 && sx < pixels[0] && sy < pixels[1] };
    }) : null;
    return { ...result, metadata_available: true, accepted_sequence: p.accepted.encoded_sequence,
      source_frame: p.accepted.source_frame, geometry_segment: p.source.geometry_segment,
      source_content_relative_ns: sourceTime, held: p.accepted.held ?? null,
      geometry: p.geometry, transform_available: transform, desktop_points: points,
      desktop_regions: transform ? projectRegions(request.desktop_regions,matrix,pixels) : null,
      ...(transform ? {} : { transform_reason: !affineValid ? 'missing_or_invalid_declared_affine'
        : !muxCanvasKnown ? 'unmeasured_muxed_canvas' : !canvasMatches ? 'declared_canvas_differs_from_muxed_dimensions'
        : 'fitted_child_window_origin_unqualified' }) };
  }
  function map(request) {
  request = validateFrameMapRequest(request);
  if (request.recording_id !== descriptor.recording_id) mapping('Resolved recording identity mismatch.');
  const mapped = request.frame_indices ? request.frame_indices.map(frame_index => ({ requested_frame_index: frame_index, ...project(packets[frame_index],frame_index,request) }))
    : request.relative_ns ? request.relative_ns.map(relative_ns => ({ requested_relative_ns: relative_ns, ...atOffset(relative_ns,request) }))
    : request.host_ns.map(host_ns=>{const relative=String(exact(host_ns)-epoch);return{requested_host_ns:host_ns,relative_ns:relative,...atOffset(relative,request)};});
  return { schema: 'record-screen-frame-map/v1', recording_id: request.recording_id, recording_state: descriptor.state,
    clock_domain: header.clock_domain, clock_instance: header.clock_instance ?? null, epoch_host_ns: header.epoch_host_ns, frame_order: 'presentation_timestamp_ascending',
    muxed_canvas_pixels: muxCanvasKnown ? muxPixels : null,
    mux_source_correspondence: { actual_packets: packets.length, accepted_submissions: acceptedCount,
      exact_timestamp_matches: matches, video_packets_without_exact_match: packets.length-matches,
      accepted_without_video_packet: acceptedCount-matchedTimes.size, journal_complete: journalComplete,
      source_reference_coverage_complete: references === packets.length,
      timestamp_correspondence_complete: journalComplete && matches === packets.length && matches === acceptedCount },
    video_outcome: descriptor.video_outcome ?? descriptor.source_packet?.video_outcome ?? null, mapped,
    clock_continuity: descriptor.source_packet?.clock_continuity ?? null,
    qualification: 'Actual muxed times joined exactly to source references; affine remains candidate outside qualified app/display geometry.',
    limits: ['No source geometry borrowed from a newer/current frame; held content uses its referenced source.',
      'Journal/video incompleteness and missing references stay explicit; never resubmit a capture or export.',
      'Packet presentation intervals are media coverage, not physical presentation latency or input-clock/actor proof.',
      'A host-clock declaration does not calibrate an external provider; use recorder-domain stamps or retain that uncertainty.',
      'Projected points/regions inside the encoded canvas do not prove visibility, semantic ownership or content inclusion.',
      'Region fractions are continuous affine canvas-area estimates, not decoded pixel coverage; rectangle extent and timing are caller-declared.',
      'Point/region projection requires declared source canvas dimensions to match the probed media stream; this does not validate affine content placement.',
      'Fitted child-enabled or child-unknown isolated windows with content_scale other than1 retain raw geometry but withhold projected positions: their desktop union origin is unqualified. Use independently qualified source geometry.'] };
  }
  return {epoch, packets, map, project, header, capture, target};
}
export function resolveFrameMap(descriptor, request, rows, probe) {
  request=validateFrameMapRequest(request);
  if(descriptor?.recording_id!==request.recording_id) mapping('Resolved recording identity mismatch.');
  return buildFrameIndex(descriptor,rows,probe).map(request);
}

async function regular(path, limit) {
  if (typeof path !== 'string' || !path.startsWith('/')) mapping('Engine must resolve an absolute local path.');
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size <= 0 || stat.size > limit) mapping('Resolved file violates bounded regular-file contract.');
    return { handle, stat };
  } catch (error) { await handle.close(); throw error; }
}
const unchanged = (a,b) => a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
async function journalRows(handle, size) {
  const rows = [], chunk = Buffer.alloc(65536), decoder = new TextDecoder('utf-8', { fatal:true });
  let offset = 0, pending = '', inspected = 0;
  const until = Date.now()+10000;
  while (offset < size) {
    if (Date.now() > until) fail('frame_mapping_deadline', 'Source snapshot exceeded its ten-second read budget.');
    const { bytesRead } = await handle.read(chunk,0,Math.min(chunk.length,size-offset),offset);
    if (!bytesRead) mapping('Source changed while reading.');
    offset += bytesRead; pending += decoder.decode(chunk.subarray(0,bytesRead),{stream:true});
    let index;
    while ((index = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0,index); pending = pending.slice(index+1);
      if (line.length > 1024*1024 || ++inspected > MAX_ROWS) mapping('Source line/row budget exceeded.');
      if (line.trim()) {
        let row;
        try { row = JSON.parse(line); } catch { mapping('Malformed source row; raw row text is not returned.'); }
        if (!row || typeof row !== 'object' || Array.isArray(row)) mapping('Invalid source row object.');
        // Keep only mapping metadata. Input text/key rows never enter the response or retained table.
        if (['header','capture','source_frame','geometry','encoded_frame','footer'].includes(row.kind)) rows.push(row);
      }
    }
    if (pending.length > 1024*1024) mapping('Source line budget exceeded.');
    await yieldLoop();
  }
  pending += decoder.decode();
  if (pending.trim()) mapping('Unterminated source row; preserve partial file and use an intact packet.');
  return rows;
}
function probeFile(fd) {
  return new Promise((resolve,reject) => {
    const child = spawn(process.env.FFPROBE_PATH || 'ffprobe', ['-v','error','-select_streams','v:0','-show_packets','-show_entries',
      'stream=time_base,width,height:packet=pts,duration','-of','json','-i','/dev/fd/3'], { stdio:['ignore','pipe','pipe',fd] });
    probeState = { pid: child.pid ?? null, quarantined:false };
    let settled = false, bytes = 0, stderrBytes = 0, output = [];
    const finish = (error, value) => { if (!settled) { settled = true; clearTimeout(timer); error ? reject(error) : resolve(value); } };
    const stop = message => { if (settled) return; probeState.quarantined = true; child.kill('SIGKILL'); finish(new EngineError('frame_mapping_probe',message)); };
    const timer = setTimeout(() => stop('Owned media probe exceeded ten seconds; no capture/export was replayed.'),10000);
    child.stdout.on('data',data => {
      bytes += data.length;
      if (bytes > 16*1024*1024) stop('Actual packet probe exceeded16MiB; use a bounded supported take.');
      else if (!settled) output.push(data);
    });
    child.stderr.on('data',data => { stderrBytes += data.length; if (stderrBytes > 32768 && !settled) stop('Media probe diagnostic limit exceeded.'); });
    child.once('error',() => finish(new EngineError('frame_mapping_probe','Owned media probe could not start.')));
    child.once('close',code => {
      probeState = null;
      if (settled) return;
      if (code !== 0) finish(new EngineError('frame_mapping_probe','No readable actual mux packet table; preserve partial source/media.'));
      else try { finish(null,JSON.parse(Buffer.concat(output).toString('utf8'))); }
      catch { finish(new EngineError('frame_mapping_probe','Actual packet probe returned invalid metadata.')); }
    });
  });
}
// One admission covers every source in a paired snapshot. Each owned probe is
// settled before the next begins; all opened leaves are checked again at the end.
export async function withFrameSnapshots(descriptors, consume) {
  if (running || probeState) fail('frame_mapping_busy','A prior owned mapping/probe is active or not confirmed closed; retry a read later.');
  if (!Array.isArray(descriptors) || descriptors.length<1 || descriptors.length>2 || descriptors.some(d=>
      typeof d?.recording_id!=='string' || !['done','failed','interrupted','cancelled'].includes(d.state))) mapping('Resolve one or two terminal recordings before mapping.');
  running = true;
  const files=[], snapshots=[];
  try {
    for(const descriptor of descriptors) {
      const journal=await regular(descriptor.source_packet?.path,MAX_JOURNAL);files.push(journal);
      const video=await regular(descriptor.video?.path,64*1024*1024*1024);files.push(video);
      const rows=await journalRows(journal.handle,journal.stat.size), probe=await probeFile(video.handle.fd);
      snapshots.push({descriptor,rows,probe,files:[journal,video].map(f=>({dev:f.stat.dev,ino:f.stat.ino,size:f.stat.size,mtimeMs:f.stat.mtimeMs,ctimeMs:f.stat.ctimeMs}))});
    }
    const result=consume(snapshots);
    for(const f of files) if(!unchanged(f.stat,await f.handle.stat())) mapping('Source/media changed during mapping; no snapshot consistency claimed.');
    if(Buffer.byteLength(JSON.stringify(result))>1024*1024) mapping('Mapped response exceeds1MiB; request fewer segments/frames/points.');
    return {...result,snapshot_consistency:'Opened regular leaves unchanged across all reads/probes; no filesystem isolation guarantee.'};
  } finally {
    await Promise.allSettled(files.map(f=>f.handle.close()));running=false;
  }
}
export async function mapRecordingFrames(descriptor, request) {
  request=validateFrameMapRequest(request);
  if(descriptor?.recording_id!==request.recording_id) mapping('Resolved recording identity mismatch.');
  return withFrameSnapshots([descriptor],s=>resolveFrameMap(descriptor,request,s[0].rows,s[0].probe));
}
