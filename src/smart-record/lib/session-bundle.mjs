// Compact live inventory, not a second timeline or a background media job.
import { lstat, realpath, opendir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { enginePaths } from './client.mjs';

const MAX_RECORDINGS = 64, MAX_ENTRIES = 256, MAX_EXPORTS = 128;
const absent = e => ['ENOENT', 'ENOTDIR'].includes(e.code);
async function file(path) {
  try {
    const s = await lstat(path);
    return { path, availability: s.isFile() && s.size > 0 ? 'available' : 'unavailable',
      ...(s.isFile() ? { bytes: s.size, ...(s.size ? {} : { reason: 'empty_file' }) } : { reason: 'not_regular_file' }) };
  } catch (e) { return { path, availability: absent(e) ? 'not_present' : 'unavailable', ...(absent(e) ? {} : { reason: e.code }) }; }
}
async function directory(path) {
  try {
    if (!(await lstat(path)).isDirectory() || await realpath(path) !== path) return 'unsafe_directory';
    return null;
  } catch (e) { return absent(e) ? 'not_present' : e.code; }
}
async function exportsAt(path, budget) {
  const problem = await directory(path);
  if (problem) return { entries: [], complete: problem === 'not_present', reason: problem };
  const names = new Set(); let scanned = 0, complete = true, reason, dir;
  try {
    dir = await opendir(path, { bufferSize: 32 });
    for (;;) {
      const item = await dir.read(); if (!item) break;
      if (++scanned > MAX_ENTRIES) { complete = false; reason = 'directory_entry_budget'; break; }
      const name = item.name.replace(/\.source\.json$/, '');
      if (/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.(mp4|gif)$/.test(name)) names.add(name);
    }
  } catch (e) { complete = false; reason = e.code; }
  finally { await dir?.close(); }
  const selected = [...names].sort();
  if (selected.length > budget.remaining) { complete = false; reason = 'session_export_budget'; }
  const entries = [];
  for (const name of selected.slice(0, budget.remaining)) {
    const media = await file(join(path, name)), timing_map = await file(join(path, name + '.source.json'));
    if (timing_map.bytes > 32 * 1024 * 1024) { timing_map.availability = 'unavailable'; timing_map.reason = 'map_size_budget'; }
    entries.push({ name, availability: media.availability === 'available' && timing_map.availability === 'available' ? 'available' : 'incomplete',
      media, timing_map: { ...timing_map, expected_schema: 'smart-record-derivative/v1', generated_by: 'record_export', automatic: true } });
  }
  budget.remaining -= entries.length;
  return { entries, complete, ...(reason ? { reason } : {}) };
}

/** No writes, bulk telemetry/media reads, RPC fan-out, replay or polling. */
export async function withSessionBundle(session, { root = enginePaths().root } = {}) {
  const bundle = { schema: 'smart-record-session-bundle/v1', observed_at: new Date().toISOString(), complete: true, recordings: [],
    limits: ['Fresh filesystem inventory on each session read; not an atomic snapshot or push subscription.',
      'complete reports inventory coverage only, not a finished session, valid artifact or successful render.',
      'Availability means nonempty regular files exist; it does not validate media, map contents or source completeness.',
      'Exact maps are generated automatically at export publication; active capture journals may still be draining.',
      'Inventory covers capture and record_export artifacts; provisional cursor-render outputs remain at their returned private paths.'],
    budgets: { recordings: MAX_RECORDINGS, directory_entries_per_recording: MAX_ENTRIES, exports_per_session: MAX_EXPORTS } };
  try {
    if (!/^ses_[A-Za-z0-9]+$/.test(session.session_id)) throw new Error('invalid_session_identity');
    const home = await realpath(resolve(root)), dir = join(home, 'sessions', session.session_id);
    const issue = await directory(dir); if (issue) throw new Error(issue);
    bundle.root = dir;
    bundle.session_manifest = await file(join(dir, 'session.json'));
    bundle.events = await file(join(dir, 'events.jsonl'));
    const recordings = Array.isArray(session.recordings) ? session.recordings : [];
    bundle.recordings_total = recordings.length;
    if (recordings.length > MAX_RECORDINGS) { bundle.complete = false; bundle.reason = 'recording_budget'; }
    const budget = { remaining: MAX_EXPORTS };
    for (const r of recordings.slice(0, MAX_RECORDINGS)) {
      if (!/^rec_[A-Za-z0-9]+$/.test(r.recording_id)) { bundle.complete = false; bundle.reason ??= 'invalid_recording_identity'; continue; }
      const target = join(dir, 'recordings', r.recording_id), issue = await directory(target);
      const entry = { recording_id: r.recording_id, state: r.state, unfinished_work: r.unfinished_work ?? null };
      if (issue) { entry.availability = 'unavailable'; entry.reason = issue; bundle.complete = false; }
      else {
        entry.manifest = await file(join(target, 'recording.json'));
        entry.video = await file(join(target, 'video.mp4'));
        entry.source_journal = await file(join(target, 'source.jsonl'));
        entry.exports = await exportsAt(join(target, 'exports'), budget);
        if (!entry.exports.complete) bundle.complete = false;
      }
      bundle.recordings.push(entry);
    }
  } catch (e) { bundle.complete = false; bundle.reason = e.code ?? e.message; }
  return { ...session, bundle };
}
