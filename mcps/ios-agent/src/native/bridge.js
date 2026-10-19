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
  let fastRefreshStartup = {setterAvailable:null,enableRequested:false};
  const richCapture = require('../web/rich-capture')(global, {exclude:url=>typeof url==='string'&&url.includes('/v1/')});
  let captureReceipt;
  let captureEpoch=0;
  const cancelFixture = () => { fixtureRequest?.abort(); fixtureRequest = undefined; fixtureReport = undefined; };
  const cancelProbe = () => {
    if (!probeRequest) return;
    clearTimeout(probeRequest.timer);
    probeRequest.controller.abort();
    probeRequest = undefined;
  };
  const publish = () => bridge.publish(JSON.stringify({
    ready: true,
    applicationRegistered: domain?.registered() === true,
    protocol: 1,
    hermes: Boolean(global.HermesInternal),
    diagnostics: telemetry?.snapshot() || {active: false},
    telemetryFixture: fixtureReport,
    domain: domain?.snapshot() || {active: false},
    iosSignals: domain?.signalSnapshot() || null,
    bundleMarker: require('./runtime-marker'),
    remoteRuntimeConfigured: Boolean(runtime.metroURL),
    logBoxHidden: true,
    fastRefreshStartup,
    consoleContentExported: Boolean(captureReceipt?.ok && captureReceipt?.value?.events?.some(event=>event.kind==='console')),
    richCapture: captureReceipt,
  }));
  telemetry = require('./telemetry').installTelemetry(global, {onChange: publish});
  domain = require('./domain').createDomainRegistry({routeNames: runtime.routeNames, onChange: publish});
  global.__IOS_AGENT_DOMAIN__ = {registerApollo: domain.registerApollo, registerNavigation: domain.registerNavigation, signal: domain.signal};
  LogBox.ignoreAllLogs(true);
  bridge.hideDeveloperOverlays?.();
  require('./refresh-diagnostics').installRefreshDiagnostics(global, event => bridge.recordRefresh?.(JSON.stringify(event)));
  // Let native HMR setup finish before requesting enable. This fixes a saved
  // Fast Refresh Off preference without showing a developer overlay.
  setTimeout(() => {
    fastRefreshStartup = require('./refresh-diagnostics').enableFastRefresh(NativeModules.DevSettings);
    publish();
  }, 0);
  new NativeEventEmitter(bridge).addListener('IOSAgentCommand', ({command, message}) => {
    if (command === 'session-start') {
      captureEpoch++;void richCapture.stop(true);captureReceipt=undefined;
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
      captureEpoch++;
      void richCapture.stop(true);captureReceipt=undefined;
      cancelFixture();
      cancelProbe();
      disconnect?.();
      disconnect = undefined;
      listeners.clear();
      telemetry.stop();
      domain.stop();
    } else if (command === 'capture' && telemetry.isActive()) {
      const expectedCaptureEpoch=captureEpoch;
      void (async()=>{let request;try{request=JSON.parse(message);let value;
        if(request.op==='start')value=richCapture.start(request);
        else if(request.op==='status')value=richCapture.status();
        else if(request.op==='drain')value=richCapture.drain();
        else if(request.op==='stop'){await richCapture.stop();value=richCapture.drain();}
        else throw new Error('capture_operation_required');
        if(expectedCaptureEpoch!==captureEpoch)return;captureReceipt={requestId:request.requestId,ok:true,value};
      }catch{if(expectedCaptureEpoch!==captureEpoch)return;captureReceipt={requestId:request?.requestId,ok:false,error:'capture_operation_unavailable'};}publish();})();
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
