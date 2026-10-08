import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapTimes } from '../lib/derivative-source.mjs';

const manifest = () => ({ schema: 'record-screen-derivative/v1', parent: { recording_id: 'rec_test' },
  sampling: { fps: 12, first_parent_tick: '2', end_parent_tick_exclusive: '5' },
  time_base: ['1', '100'], parent_time_base: ['1', '1000'],
  frames: [
    { index: 0, pts: '0', duration: '8', nominal_parent_tick: '2', parent_pts: '0', parent_packet_index: 0 },
    { index: 1, pts: '8', duration: '9', nominal_parent_tick: '3', parent_pts: '170', parent_packet_index: 1 },
    { index: 2, pts: '17', duration: '8', nominal_parent_tick: '4', parent_pts: '170', parent_packet_index: 1 }
  ] });

test('trim grid and GIF clock map inside service, with held content separate', () => {
  const r = mapTimes(manifest(), ['0', '250000000', '375000000', '416666667'], 'rec_test').mapped;
  assert.equal(r[0].reason, 'before_first_export_sample');
  assert.deepEqual(r[1].derivative_time_ns, { numerator: '80000000', denominator: '1' });
  assert.deepEqual(r[2].derivative_time_ns, { numerator: '210000000', denominator: '1' });
  assert.deepEqual(r[2].source_frame_parent_ns, { numerator: '170000000', denominator: '1' });
  assert.equal(r[3].reason, 'at_or_after_export_end');
});
test('fractional mapping remains exact beyond JS integer precision', () => {
  const m = manifest(); m.time_base = ['1', '1000000000'];
  m.frames[1].pts = '9007199254740999'; m.frames[1].duration = '83333333';
  const r = mapTimes(m, ['250000001']).mapped[0];
  assert.deepEqual(r.derivative_time_ns, { numerator: '2251799813685249999999999', denominator: '250000000' });
});
test('unknown, invalid and cross-recording clocks cannot inherit a map', () => {
  assert.throws(() => mapTimes(manifest(), ['250000000'], 'other'), /identity/);
  assert.throws(() => mapTimes(manifest(), [250000000]), /decimal/);
  assert.throws(() => mapTimes({ ...manifest(), time_base: ['1', '0'] }, ['250000000']), /clock/);
  const m = manifest(); m.frames[1].nominal_parent_tick = '99';
  assert.throws(() => mapTimes(m, ['250000000']), /identity/);
});
