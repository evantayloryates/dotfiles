const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createTelemetry, installTelemetry} = require('../native/telemetry');
const http = require('node:http');
const {spawnSync} = require('node:child_process');

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

test('queued callbacks and old fetch rejections cannot cross lease generations', async () => {
  const ticks = []; let emissions = 0, reject;
  const t = createTelemetry({schedule: fn => (ticks.push(fn), ticks.length), cancel() { throw new Error('cancel unavailable'); }, onChange: () => emissions++});
  t.start();
  const pending = t.fetch(() => new Promise((resolve, fail) => { reject = fail; }), null, ['private-url']);
  t.stop(); t.start(); t.console('log');
  assert.equal(ticks.length, 2);
  ticks[0](); assert.equal(emissions, 3);
  t.console('log'); assert.equal(ticks.length, 2); // old callback did not clear new timer
  ticks[1](); assert.equal(emissions, 4);
  const error = new Error('private old error'); reject(error);
  await assert.rejects(pending, actual => actual === error);
  assert.equal(t.snapshot().inFlight, 0);
  assert.equal(t.snapshot().network.length, 0);
  t.stop(); ticks[1](); assert.equal(emissions, 5);
});

test('clock, scheduler and observer failures cannot prevent or repeat application fetch', async () => {
  let calls = 0;
  const t = createTelemetry({now() { throw new Error('clock failure'); }, schedule() { throw new Error('timer failure'); }, onChange() { throw new Error('observer failure'); }});
  t.start();
  const response = {status: 204};
  assert.equal(await t.fetch(() => { calls++; return Promise.resolve(response); }, null, ['url']), response);
  assert.equal(calls, 1);
  assert.deepEqual(t.snapshot().network[0], {sequence: 1, method: 'GET', status: 204, failed: false, durationMs: null});
  const error = new Error('original fetch error');
  assert.throws(() => t.fetch(() => { calls++; throw error; }, null, ['url']), actual => actual === error);
  assert.equal(calls, 2); assert.equal(t.snapshot().inFlight, 0); t.stop();
});

test('all event rings are bounded, snapshots detached, duration and metadata allowlisted', async () => {
  let clock = 10;
  const t = createTelemetry({now: () => clock}); t.start();
  for (let i = 0; i < 100; i++) {
    t.error(i % 2 === 0, 'private-error-source');
    await t.fetch(() => Promise.resolve({status: 999}), null, ['private-url', {method: 'private-custom-method'}]);
  }
  const snapshot = t.snapshot();
  assert.equal(snapshot.errors.length, 64); assert.equal(snapshot.network.length, 64);
  assert.equal(snapshot.dropped.errors, 36); assert.equal(snapshot.dropped.network, 36);
  assert.equal(snapshot.network[0].method, 'OTHER'); assert.equal(snapshot.network[0].status, null);
  assert.equal(snapshot.errors[0].source, 'runtime');
  snapshot.network[0].method = 'SECRET'; snapshot.errors[0].source = 'SECRET';
  assert.equal(/private|SECRET/.test(JSON.stringify(t.snapshot())), false);
  await t.fetch(() => { clock = -10; return Promise.resolve({status: 200}); }, null, ['url']);
  assert.equal(t.snapshot().network.at(-1).durationMs, 0);
  await t.fetch(() => { clock = 1e12; return Promise.resolve({status: 200}); }, null, ['url']);
  assert.equal(t.snapshot().network.at(-1).durationMs, 86400000); t.stop();
});

test('runtime handler throws remain visible, idle handler forwards, later handler survives disposal', () => {
  const error = new Proxy({}, {get() { throw new Error('error content must not be inspected'); }});
  const receiver = {}; let calls = 0, handler;
  const original = function (actual, fatal) {
    calls++; assert.equal(this, receiver); assert.equal(actual, error); assert.equal(fatal, false); throw error;
  };
  handler = original;
  const runtime = {ErrorUtils: {getGlobalHandler: () => handler, setGlobalHandler: next => { handler = next; }}};
  const t = installTelemetry(runtime);
  assert.throws(() => handler.call(receiver, error, false), actual => actual === error);
  assert.equal(t.snapshot().errors.length, 0); t.start();
  assert.throws(() => handler.call(receiver, error, false), actual => actual === error);
  assert.equal(calls, 2); assert.equal(t.snapshot().errors[0].fatal, false);
  const later = () => {}; handler = later; t.dispose(); assert.equal(handler, later);
});

test('unhandled fetch rejection remains unhandled by the application', () => {
  const script = `
    const {createTelemetry} = require(${JSON.stringify(require.resolve('../native/telemetry'))});
    const error = new Error('synthetic');
    process.once('unhandledRejection', actual => { process.exitCode = actual === error ? 0 : 7; t.stop(); });
    const t = createTelemetry(); t.start(); t.fetch(() => Promise.reject(error), null, ['url']);
  `;
  const result = spawnSync(process.execPath, ['--unhandled-rejections=warn', '-e', script], {encoding: 'utf8', timeout: 5000});
  assert.equal(result.status, 0);
  assert.match(result.stderr, /UnhandledPromiseRejectionWarning/);
});

test('real fetch HTTP statuses, response consumption, abort and timeout preserve caller semantics', async () => {
  const server = http.createServer((request, response) => {
    const path = new URL(request.url, 'http://fixture.invalid').pathname;
    if (path === '/hang') return;
    const code = Number(path.slice(1)); response.writeHead(code); response.end('synthetic response body');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const runtime = {fetch: global.fetch}, t = installTelemetry(runtime); t.start();
  try {
    for (const status of [200, 404, 500]) {
      const response = await runtime.fetch(`${base}/${status}?token=synthetic-private`);
      assert.equal(response.status, status); assert.equal(response.bodyUsed, false);
      assert.equal(await response.text(), 'synthetic response body');
    }
    const controller = new AbortController(), reason = new Error('synthetic private cancellation');
    const aborted = runtime.fetch(`${base}/hang`, {signal: controller.signal}); controller.abort(reason);
    await assert.rejects(aborted, actual => actual === reason);
    await assert.rejects(runtime.fetch(`${base}/hang`, {signal: AbortSignal.timeout(100)}), actual => actual.name === 'TimeoutError');
    const snapshot = t.snapshot();
    assert.deepEqual(snapshot.network.map(event => ({status: event.status, failed: event.failed})), [
      {status: 200, failed: false}, {status: 404, failed: false}, {status: 500, failed: false},
      {status: null, failed: true}, {status: null, failed: true},
    ]);
    assert.equal(snapshot.inFlight, 0);
    assert.equal(/127\.0\.0\.1|synthetic|private|token|reason/.test(JSON.stringify(snapshot)), false);
  } finally { t.dispose(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
