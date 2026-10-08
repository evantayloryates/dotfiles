const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createTelemetry, installTelemetry} = require('../native/telemetry');

test('no idle history, bounded records, positions only and detached snapshots', () => {
  let ticks = [], emissions = 0;
  const t = createTelemetry({schedule: callback => (ticks.push(callback), ticks.length), cancel: () => {}, onChange: () => emissions++});
  t.console('warn', 'private body\n at privateToken (/secret/path?token=secret:123:45)');
  assert.equal(t.snapshot().console.length, 0);
  t.start();
  for (let i = 0; i < 100; i++) t.console('warn', 'private body\n at privateToken (/secret/path?token=secret:123:45)');
  const snapshot = t.snapshot();
  assert.equal(snapshot.console.length, 64);
  assert.equal(snapshot.dropped.console, 36);
  assert.equal(snapshot.counts.warn, 100);
  assert.deepEqual(snapshot.console[0].positions, [{line: 123, column: 45}]);
  assert.equal(/private|secret|token|body/.test(JSON.stringify(snapshot)), false);
  snapshot.console[0].positions[0].line = 900;
  assert.equal(t.snapshot().console[0].positions[0].line, 123);
  assert.equal(ticks.length, 1); // burst coalesced
  ticks[0](); assert.equal(emissions, 2);
  t.stop(); assert.equal(t.snapshot().counts.warn, 0);
  t.start(); assert.equal(t.snapshot().console.length, 0);
});

test('console forwarding preserves arguments, receiver and return without inspecting arguments', () => {
  const argument = new Proxy({}, {get() { throw new Error('must not inspect'); }});
  let received, receiver;
  const runtime = {console: {warn(...args) { received = args; receiver = this; return 42; }}};
  const t = installTelemetry(runtime);
  t.start();
  assert.equal(runtime.console.warn(argument), 42);
  assert.deepEqual(received, [argument]); assert.equal(receiver, runtime.console);
  assert.equal(t.snapshot().counts.warn, 1);
  t.dispose();
});

test('fetch preserves response and rejection identity, records no URL, headers or bodies', async () => {
  let clock = 100, received, receiver;
  const response = {status: 201, secretBody: 'must not export'};
  const runtime = {fetch(...args) { received = args; receiver = this; return Promise.resolve(response); }};
  const t = installTelemetry(runtime, {now: () => clock}); t.start();
  const init = {method: 'post', headers: {Authorization: 'secret'}, body: 'private phone'};
  const promise = runtime.fetch('https://private/path?token=secret', init);
  clock = 150;
  assert.equal(await promise, response); assert.equal(receiver, runtime);
  assert.deepEqual(received, ['https://private/path?token=secret', init]);
  assert.deepEqual(t.snapshot().network[0], {sequence: 1, method: 'POST', status: 201, failed: false, durationMs: 50});
  assert.equal(/private|secret|Authorization|phone/.test(JSON.stringify(t.snapshot())), false);
  const error = new Error('secret');
  const rejected = t.fetch(() => Promise.reject(error), null, ['url']);
  await assert.rejects(rejected, actual => actual === error);
  assert.equal(t.snapshot().network[1].failed, true);
  assert.equal(t.snapshot().inFlight, 0); t.dispose();
});

test('no double getter consumption, idle promise untouched, and old completions fenced', async () => {
  let reads = 0, resolve;
  const init = {get method() { reads++; return 'POST'; }};
  const original = () => new Promise(done => { resolve = done; });
  const t = createTelemetry();
  const untouched = Promise.resolve({status: 200});
  assert.equal(t.fetch(() => untouched, null, ['url', init]), untouched);
  assert.equal(reads, 0);
  t.start();
  const pending = t.fetch(original, null, ['url', init]);
  assert.equal(reads, 0); assert.equal(t.snapshot().inFlight, 1);
  t.stop(); t.start(); resolve({status: 200}); await pending;
  assert.equal(t.snapshot().network.length, 0); assert.equal(t.snapshot().inFlight, 0); t.stop();
});

test('runtime error handler forwarded and diagnostic failures cannot swallow errors', () => {
  const error = new Error('private'); let observed, handler = function (...args) { observed = args; return 8; };
  const original = handler;
  const runtime = {ErrorUtils: {getGlobalHandler: () => handler, setGlobalHandler: next => { handler = next; }}};
  const t = installTelemetry(runtime, {onChange() { throw new Error('observer failed'); }}); t.start();
  assert.equal(handler(error, true), 8); assert.deepEqual(observed, [error, true]);
  assert.deepEqual(t.snapshot().errors[0], {sequence: 1, fatal: true, source: 'runtime'});
  t.dispose(); assert.equal(handler, original);
  t.start();
  assert.throws(() => t.fetch(() => { throw error; }, null, ['url']), actual => actual === error);
  assert.equal(t.snapshot().network[0].failed, true); t.stop();
});

test('disposal preserves later third-party wrappers', () => {
  const runtime = {console: {warn() {}}, fetch: () => Promise.resolve({status: 200})};
  const t = installTelemetry(runtime), later = () => 19;
  runtime.console.warn = later; runtime.fetch = later;
  t.dispose(); assert.equal(runtime.console.warn, later); assert.equal(runtime.fetch, later);
});
