import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyGuardedBackend} from '../src/backend_guard.mjs';
const bundle = ['node', '-r', 'dotenv/config', '.webpack/server.development.js'];
const wrapper = ['node', 'scripts/run-local-development.cjs', '--', ...bundle];
const baseline = [{pid: '583', parent: '1', args: wrapper, local: true}, {pid: '590', parent: '583', args: bundle, local: true}];
const browserTest = [{pid: '3142', parent: '3141', args: wrapper, local: false}, {pid: '3158', parent: '3142', args: bundle, local: false}];
const slot = [{pid: '2054', parent: '2040', args: ['node', '.scratch/rig-slot2/server.development.js'], local: false}];

test('guarded :4000 server passes while other worktrees run their own servers', () => {
  assert.equal(verifyGuardedBackend([...baseline, ...browserTest, ...slot], ['590']), true);
});
test('an unguarded process anywhere in the :4000 server family refuses', () => {
  assert.equal(verifyGuardedBackend([{...baseline[0], local: false}, baseline[1]], ['590']), false);
  assert.equal(verifyGuardedBackend([...baseline, {pid: '600', parent: '590', args: bundle, local: false}], ['590']), false);
});
test('an unguarded server holding :4000 refuses even beside a guarded one', () => {
  assert.equal(verifyGuardedBackend([...baseline, ...browserTest], ['3158']), false);
});
test('no listener, an unknown listener, or a non-server listener refuses', () => {
  assert.equal(verifyGuardedBackend(baseline, []), false);
  assert.equal(verifyGuardedBackend(baseline, ['999']), false);
  assert.equal(verifyGuardedBackend([...baseline, {pid: '700', parent: '1', args: ['socat', 'TCP-LISTEN:4000'], local: false}], ['700']), false);
});
test('parent cycles terminate', () => {
  assert.equal(verifyGuardedBackend([{pid: '5', parent: '6', args: bundle, local: true}, {pid: '6', parent: '5', args: bundle, local: true}], ['5']), true);
});
