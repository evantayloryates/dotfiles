/* Build-level prelude. Active only when the opt-in native dev module exists. */
import {LogBox, NativeEventEmitter, NativeModules} from 'react-native';

const bridge = __DEV__ ? NativeModules.IOSAgentBridge : null;
const runtime = require('./runtime-config');
if (bridge && !global.__IOS_AGENT_BRIDGE_STARTED__) {
  global.__IOS_AGENT_BRIDGE_STARTED__ = true;
  const listeners = new Set();
  let disconnect;
  let sequence = 0;
  let telemetry;
  let domain;
  let probeRequest;
  let fixtureRequest;
  let fixtureReport;
  const cancelFixture = () => { fixtureRequest?.abort(); fixtureRequest = undefined; fixtureReport = undefined; };
  const cancelProbe = () => {
    if (!probeRequest) return;
    clearTimeout(probeRequest.timer);
    probeRequest.controller.abort();
    probeRequest = undefined;
  };
  const publish = () => bridge.publish(JSON.stringify({
    ready: true,
    protocol: 1,
    hermes: Boolean(global.HermesInternal),
    diagnostics: telemetry?.snapshot() || {active: false},
    telemetryFixture: fixtureReport,
    domain: domain?.snapshot() || {active: false},
    bundleMarker: require('./runtime-marker'),
    remoteRuntimeConfigured: Boolean(runtime.metroURL),
    logBoxHidden: true,
    consoleContentExported: false,
  }));
  telemetry = require('./telemetry').installTelemetry(global, {onChange: publish});
  domain = require('./domain').createDomainRegistry({routeNames: runtime.routeNames, onChange: publish});
  global.__IOS_AGENT_DOMAIN__ = {registerApollo: domain.registerApollo, registerNavigation: domain.registerNavigation};
  LogBox.ignoreAllLogs(true);
  new NativeEventEmitter(bridge).addListener('IOSAgentCommand', ({command, message}) => {
    if (command === 'session-start') {
      cancelFixture();
      cancelProbe();
      disconnect?.();
      listeners.clear();
      domain.start();
      telemetry.start();
      disconnect = require('react-devtools-core').connectWithCustomMessagingProtocol({
        onSubscribe: listener => listeners.add(listener),
        onUnsubscribe: listener => listeners.delete(listener),
        onMessage: (event, payload) => bridge.sendReact(JSON.stringify({event, payload, sequence: ++sequence})),
      });
    } else if (command === 'session-end') {
      cancelFixture();
      cancelProbe();
      disconnect?.();
      disconnect = undefined;
      listeners.clear();
      telemetry.stop();
      domain.stop();
    } else if (command === 'diagnostics-probe' && telemetry.isActive() && runtime.graphqlURL) {
      if (probeRequest) return;
      const token = domain.token();
      const controller = new AbortController();
      const request = {controller, timer: setTimeout(() => controller.abort(), 10000)};
      probeRequest = request;
      console.warn('ios-agent synthetic diagnostic probe');
      fetch(runtime.graphqlURL, {signal: controller.signal, method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({query: 'query IOSAgentReadiness { __typename }'})})
        .then(async response => {
          const value = await response.json();
          const ready = response.status === 200 && value?.data?.__typename === 'Query' && !value.errors;
          domain.recordProbe(token, {httpStatus: response.status, graphqlReady: ready, outcome: ready ? 'ready' : 'shape'});
        }).catch(() => domain.recordProbe(token, {graphqlReady: false, outcome: 'network'}))
        .finally(() => { clearTimeout(request.timer); if (probeRequest === request) probeRequest = undefined; });
    } else if (command === 'diagnostics-matrix' && telemetry.isActive() && runtime.metroURL) {
      if (fixtureRequest) return;
      const controller = new AbortController(); fixtureRequest = controller;
      const token = domain.token();
      const timer = setTimeout(() => controller.abort(), 10000);
      require('./telemetry-fixture').runTelemetryFixture(global, runtime.metroURL, controller.signal)
        .then(report => {
          if (fixtureRequest === controller && !controller.signal.aborted && telemetry.isActive() && token === domain.token()) {
            fixtureReport = report; publish();
          }
        }).catch(() => {
          if (fixtureRequest === controller && !controller.signal.aborted && telemetry.isActive() && token === domain.token()) {
            fixtureReport = {passed: false, scope: 'isolated-adapter-with-device-global-fetch', failure: 'fixture_transport_or_runtime'}; publish();
          }
        }).finally(() => { clearTimeout(timer); if (fixtureRequest === controller) fixtureRequest = undefined; });
    } else if (command === 'react') {
      try {
        const frame = JSON.parse(message);
        for (const listener of listeners) listener(frame);
      } catch {
        telemetry.error(false, 'protocol');
      }
    }
  });
  publish();
}
