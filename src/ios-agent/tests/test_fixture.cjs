const {test} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {fixtureMiddleware} = require('../native/fixture-middleware.cjs');
const {runTelemetryFixture} = require('../native/telemetry-fixture');

test('fixed matrix uses real HTTP errors/abort/timeout/late completion and leaves runtime untouched', async () => {
  const server = http.createServer(fixtureMiddleware((req, res) => {res.writeHead(418);res.end();}));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let appHandlerCalls = 0;
  const handler = () => {appHandlerCalls++;};
  const runtime = {fetch: (url, options) => fetch(base + new URL(url).pathname, options),
    ErrorUtils: {getGlobalHandler: () => handler}};
  const originalFetch = runtime.fetch;
  try {
    const report = await runTelemetryFixture(runtime, 'https://fixture.tail.ts.net:10444/', new AbortController().signal);
    assert.equal(report.passed, true);
    for (const value of Object.values(report.checks)) assert.equal(value, true);
    assert.equal(appHandlerCalls, 0); assert.equal(runtime.fetch, originalFetch);
    assert.equal(runtime.ErrorUtils.getGlobalHandler(), handler);
    assert.equal(JSON.stringify(report).includes('fixture.tail'), false);
    assert.equal((await fetch(base + '/ios-agent-fixture/ok?escape=1')).status, 418);
    assert.equal((await fetch(base + '/ios-agent-fixture/ok', {method:'POST'})).status, 418);
    const parallel = await Promise.all([1,2,3].map(() => fetch(base + '/ios-agent-fixture/slow')));
    assert.deepEqual(parallel.map(r=>r.status).sort(), [200,200,429]);
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('fixture refuses URL escapes and an already-cancelled lease without fetching or altering handlers', async () => {
  let calls = 0;
  const runtime = {fetch: () => {calls++;throw new Error('unexpected');}};
  for (const url of ['http://fixture.ts.net:10444/', 'https://token@fixture.ts.net:10444/', 'https://fixture.ts.net:10444/?url=other', 'https://fixture.ts.net:10444/other']) {
    await assert.rejects(runTelemetryFixture(runtime,url,new AbortController().signal), /fixture_runtime_required/);
  }
  const controller = new AbortController();controller.abort();
  await assert.rejects(runTelemetryFixture(runtime,'https://fixture.ts.net:10444/',controller.signal), /fixture_cancelled/);
  assert.equal(calls,0);
});
