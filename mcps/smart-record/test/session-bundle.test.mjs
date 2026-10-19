import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm, realpath, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withSessionBundle } from '../src/lib/session-bundle.mjs';

async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'smart-bundle-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dir = join(root, 'sessions/ses_test/recordings/rec_test');
  await mkdir(join(dir, 'exports'), { recursive: true });
  for (const name of ['recording.json', 'source.jsonl', 'video.mp4']) await writeFile(join(dir, name), 'fixture');
  const session = { session_id: 'ses_test', state: 'open', recordings: [{ recording_id: 'rec_test', state: 'recording', unfinished_work: { encoder: true } }] };
  return { root, dir, session };
}
test('normal session read discovers existing export map without mapping RPC, and refreshes publication', async t => {
  const { root, dir, session } = await fixture(t);
  const first = await withSessionBundle(session, { root });
  assert.equal(first.bundle.complete, true);
  assert.equal(first.bundle.recordings[0].state, 'recording');
  assert.deepEqual(first.bundle.recordings[0].unfinished_work, { encoder: true });
  assert.deepEqual(first.bundle.recordings[0].exports.entries, []);
  await writeFile(join(dir, 'exports/clip.mp4'), 'media');
  const pending = await withSessionBundle(session, { root });
  assert.equal(pending.bundle.recordings[0].exports.entries[0].availability, 'incomplete');
  await writeFile(join(dir, 'exports/clip.mp4.source.json'), '{"schema":"smart-record-derivative/v1"}');
  const ready = await withSessionBundle({ ...session, recordings: [{ recording_id: 'rec_test', state: 'done' }] }, { root });
  const exp = ready.bundle.recordings[0].exports.entries[0];
  assert.equal(exp.availability, 'available');
  assert.equal(exp.timing_map.automatic, true);
  assert.equal(ready.bundle.recordings[0].state, 'done');
  assert.match(exp.timing_map.path, /clip.mp4.source.json$/);
  assert.equal(await readFile(join(dir, 'source.jsonl'), 'utf8'), 'fixture');
  assert.equal(Object.hasOwn(session, 'bundle'), false);
  assert.ok(ready.bundle.limits.some(s => s.includes('does not validate')));
});
test('symlink directories and media/map leaves cannot claim usable artifacts', async t => {
  const { root, dir, session } = await fixture(t);
  await symlink(join(dir, 'video.mp4'), join(dir, 'exports/linked.mp4'));
  await writeFile(join(dir, 'exports/linked.mp4.source.json'), 'map');
  const result = await withSessionBundle(session, { root });
  assert.equal(result.bundle.recordings[0].exports.entries[0].availability, 'incomplete');
  await rm(join(dir, 'exports'), { recursive: true });
  await symlink(root, join(dir, 'exports'));
  const unsafe = await withSessionBundle(session, { root });
  assert.equal(unsafe.bundle.complete, false);
  assert.equal(unsafe.bundle.recordings[0].exports.reason, 'unsafe_directory');
});
test('bounded inventories state truncation rather than implying all exports are known', async t => {
  const { root, dir, session } = await fixture(t);
  for (let n = 0; n < 130; n++) await writeFile(join(dir, `exports/clip${n}.mp4`), 'x');
  const result = await withSessionBundle(session, { root });
  assert.equal(result.bundle.complete, false);
  assert.equal(result.bundle.recordings[0].exports.entries.length, 128);
  assert.equal(result.bundle.recordings[0].exports.reason, 'session_export_budget');
  for (let n = 130; n < 260; n++) await writeFile(join(dir, `exports/clip${n}.mp4`), 'x');
  const truncated = await withSessionBundle(session, { root });
  assert.equal(truncated.bundle.complete, false);
  assert.equal(truncated.bundle.recordings[0].exports.complete, false);
  const many = await withSessionBundle({ ...session, recordings: Array(65).fill(session.recordings[0]) }, { root });
  assert.equal(many.bundle.recordings.length, 64);
  assert.equal(many.bundle.complete, false);
  assert.ok(many.bundle.recordings.reduce((n, r) => n + r.exports.entries.length, 0) <= 128);
});
test('invalid identities and missing folders preserve native state with explicit inventory failure', async t => {
  const { root, session } = await fixture(t);
  const malformed = await withSessionBundle({ ...session, session_id: '../outside' }, { root });
  assert.equal(malformed.bundle.reason, 'invalid_session_identity');
  assert.equal(malformed.state, 'open');
  const missing = await withSessionBundle({ session_id: 'ses_missing', recordings: [] }, { root });
  assert.equal(missing.bundle.complete, false);
  assert.equal(missing.bundle.reason, 'not_present');
});
