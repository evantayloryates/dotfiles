const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const {createRequire} = require('node:module');

test('real bridge binds diagnostics to native session events and preserves runtime forwarding',
  {skip: !process.env.IOS_AGENT_MOBILE_ROOT}, async () => {
    const requireMobile = createRequire(path.join(process.env.IOS_AGENT_MOBILE_ROOT, 'package.json'));
    const babel = requireMobile('@babel/core');
    const filename = path.join(__dirname, '../native/bridge.js');
    const code = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
      filename, babelrc: false, configFile: false,
      plugins: [requireMobile.resolve('@babel/plugin-transform-modules-commonjs')],
    }).code;
    let receive, published = [], timers = new Map(), nextTimer = 0, forwarded = [], hidden = false;
    let deferred, finishRequest, requestSignal, finishFixture, fixtureSignal;
    const bridge = {publish: json => published.push(JSON.parse(json)), sendReact() {}};
    const fakeRequire = name => {
      if (name === 'react-native') return {
        NativeModules: {IOSAgentBridge: bridge}, LogBox: {ignoreAllLogs: value => { hidden = value; }},
        NativeEventEmitter: class {addListener(name, listener) { assert.equal(name, 'IOSAgentCommand'); receive = listener; }},
      };
      if (name === './telemetry') return require('../native/telemetry');
      if (name === './domain') return {createDomainRegistry: options => require('../native/domain').createDomainRegistry({...options, schedule: () => 0, cancel() {}})};
      if (name === './runtime-config') return {metroURL: 'https://synthetic.ts.net:10444/', graphqlURL: 'https://synthetic.ts.net:10445/development/graphql', routeNames: ['Welcome']};
      if (name === './runtime-marker') return 'test-runtime';
      if (name === './telemetry-fixture') return {runTelemetryFixture: (target, url, signal) => {
        fixtureSignal = signal;
        return new Promise(resolve => {finishFixture = resolve;});
      }};
      if (name === 'react-devtools-core') return {connectWithCustomMessagingProtocol: () => () => {}};
      throw new Error('unexpected_dependency');
    };
    const runtime = {__DEV__: true, require: fakeRequire,
      console: {warn(...args) { forwarded.push(args); return 7; }},
      fetch: (url, options) => {
        requestSignal = options?.signal;
        return deferred ? new Promise(resolve => {finishRequest = resolve;}) : Promise.resolve({status: url.includes('/development/graphql') ? 200 : 204, json: async () => ({data: {__typename: 'Query'}})});
      },
      AbortController,
      setTimeout: callback => { const id = ++nextTimer; timers.set(id, callback); return id; },
      clearTimeout: id => timers.delete(id),
    };
    runtime.global = runtime;
    // Inject scheduler into the pure adapter; code and native event wiring are real.
    const original = fakeRequire;
    runtime.require = name => name === './telemetry' ? {
      installTelemetry: (target, options) => require('../native/telemetry').installTelemetry(target,
        {...options, schedule: runtime.setTimeout, cancel: runtime.clearTimeout}),
    } : original(name);
    vm.runInNewContext(code, runtime, {filename});
    assert.equal(hidden, true); assert.equal(published.at(-1).diagnostics.active, false);
    assert.equal(published.at(-1).applicationRegistered,false);
    const removeApollo=runtime.__IOS_AGENT_DOMAIN__.registerApollo({});
    const removeNav=runtime.__IOS_AGENT_DOMAIN__.registerNavigation(()=>{throw Error('idle_read');});
    assert.equal(published.at(-1).applicationRegistered,true);
    assert.equal(published.at(-1).domain.active,false);
    removeNav(); removeApollo();
    assert.equal(published.at(-1).applicationRegistered,false);
    runtime.console.warn('synthetic-idle');
    receive({command: 'session-start'});
    assert.equal(published.at(-1).diagnostics.counts.warn, 0);
    assert.equal(runtime.console.warn('synthetic-active'), 7);
    await runtime.fetch('https://synthetic.invalid/private');
    receive({command: 'react', message: 'invalid-json'});
    for (const callback of timers.values()) callback(); timers.clear();
    const diagnostics = published.at(-1).diagnostics;
    assert.equal(diagnostics.counts.warn, 1); assert.equal(diagnostics.network[0].status, 204);
    assert.equal(diagnostics.errors[0].source, 'protocol');
    assert.equal(JSON.stringify(diagnostics).includes('synthetic'), false);
    assert.deepEqual(forwarded, [['synthetic-idle'], ['synthetic-active']]);
    runtime.__IOS_AGENT_DOMAIN__.registerNavigation(() => 'Welcome');
    assert.equal(published.at(-1).domain.navigation.route, 'Welcome');
    receive({command: 'diagnostics-probe'});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(published.at(-1).domain.probe.outcome, 'ready');
    deferred = true;
    receive({command: 'diagnostics-probe'});
    receive({command: 'session-end'});
    assert.equal(requestSignal.aborted, true);
    finishRequest({status:200,json:async () => ({data:{__typename:'Query'}})});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(published.at(-1).domain.probe, null);
    assert.equal(published.at(-1).diagnostics.active, false);
    assert.equal(published.at(-1).diagnostics.console.length, 0);
    assert.equal(published.at(-1).diagnostics.network.length, 0);
    receive({command: 'session-start'});
    receive({command: 'diagnostics-matrix'});
    receive({command: 'session-end'});
    assert.equal(fixtureSignal.aborted, true);
    receive({command: 'session-start'});
    finishFixture({passed:true,scope:'isolated-adapter-with-device-global-fetch'});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(published.at(-1).telemetryFixture, undefined);
    receive({command:'session-end'});
  });
