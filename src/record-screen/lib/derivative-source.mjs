import { openSync, closeSync, fstatSync, readFileSync, constants } from 'node:fs';
import { EngineError } from './client.mjs';

const fail = message => { throw new EngineError('derivative_mapping', message); };
const integer = value => {
  if (typeof value !== 'string' || !/^-?[0-9]{1,24}$/.test(value)) fail('exact decimal integer required');
  return BigInt(value);
};
function rational(n, d) {
  if (d <= 0n) fail('invalid clock denominator');
  let a = n < 0n ? -n : n, b = d;
  while (b) [a, b] = [b, a % b];
  const divisor = a || 1n;
  return { numerator: String(n / divisor), denominator: String(d / divisor) };
}

/** Service-owned mapping: media clocks stay rational, including GIF rounding.
 *  The frame's content clock is separate from the event's timeline position. */
export function mapTimes(manifest, times, recordingId) {
  if (manifest?.schema !== 'record-screen-derivative/v1' ||
      (recordingId !== undefined && manifest.parent?.recording_id !== recordingId)) fail('manifest identity mismatch');
  if (!Array.isArray(times) || times.length < 1 || times.length > 256) fail('map 1–256 exact parent offsets');
  const rate = manifest.sampling?.fps;
  if (!Number.isInteger(rate) || rate < 1 || rate > 120) fail('invalid sampling rate');
  const first = integer(manifest.sampling.first_parent_tick);
  const last = integer(manifest.sampling.end_parent_tick_exclusive);
  const frames = manifest.frames;
  if (!Array.isArray(frames) || last <= first || last - first !== BigInt(frames.length) || frames.length > 120000) fail('invalid frame grid');
  if (!Array.isArray(manifest.time_base) || manifest.time_base.length !== 2 ||
      !Array.isArray(manifest.parent_time_base) || manifest.parent_time_base.length !== 2) fail('missing media clocks');
  const [num, den] = manifest.time_base.map(integer);
  const [pn, pd] = manifest.parent_time_base.map(integer);
  if (num <= 0n || den <= 0n || pn <= 0n || pd <= 0n) fail('invalid media clocks');
  const billion = 1000000000n;
  const mapped = times.map(value => {
    const ns = integer(value), grid = ns * BigInt(rate) - first * billion;
    if (grid < 0n || grid >= BigInt(frames.length) * billion) return {
      parent_relative_ns: value, included: false, reason: grid < 0n ? 'before_first_export_sample' : 'at_or_after_export_end'
    };
    const index = Number(grid / billion), phase = grid % billion, row = frames[index];
    if (row.index !== index || integer(row.nominal_parent_tick) !== first + BigInt(index)) fail('frame identity mismatch');
    const pts = integer(row.pts), duration = integer(row.duration), parentPts = integer(row.parent_pts);
    if (duration <= 0n) fail('unknown frame duration');
    return { parent_relative_ns: value, included: true, frame_index: index,
      derivative_time_ns: rational((pts * billion + duration * phase) * num, den),
      source_frame_parent_ns: rational(parentPts * pn * billion, pd),
      parent_packet_index: row.parent_packet_index, padded_before_first_source: row.padded_before_first_source === true };
  });
  return { schema: manifest.schema, video: manifest.video, geometry: manifest.geometry, mapped,
    qualification: 'Exact media-clock interpolation; event reception/ownership and physical display latency remain separate' };
}

export function mapDerivativeTimes(path, times, recordingId) {
  // The engine resolves this path from recording ID + plain export name.
  // Do not follow a substituted leaf or read unbounded bulk telemetry.
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const s = fstatSync(fd);
    if (!s.isFile() || s.size <= 0 || s.size > 32 * 1024 * 1024) fail('manifest exceeds the bounded regular-file contract');
    return mapTimes(JSON.parse(readFileSync(fd, 'utf8')), times, recordingId);
  } finally { closeSync(fd); }
}
