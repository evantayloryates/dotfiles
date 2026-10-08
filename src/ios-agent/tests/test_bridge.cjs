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
    const bridge = {publish: json => published.push(JSON.parse(json)), sendReact() {}};
    const fakeRequire = name => {
      if (name === 'react-native') return {
        NativeModules: {IOSAgentBridge: bridge}, LogBox: {ignoreAllLogs: value => { hidden = value; }},
        NativeEventEmitter: class {addListener(name, listener) { assert.equal(name, 'IOSAgentCommand'); receive = listener; }},
      };
      if (name === './telemetry') return require('../native/telemetry');
      if (name === 'react-devtools-core') return {connectWithCustomMessagingProtocol: () => () => {}};
      throw new Error('unexpected_dependency');
    };
    const runtime = {__DEV__: true, require: fakeRequire,
      console: {warn(...args) { forwarded.push(args); return 7; }},
      fetch: () => Promise.resolve({status: 204}),
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
    receive({command: 'session-end'});
    assert.equal(published.at(-1).diagnostics.active, false);
    assert.equal(published.at(-1).diagnostics.console.length, 0);
    assert.equal(published.at(-1).diagnostics.network.length, 0);
  });
