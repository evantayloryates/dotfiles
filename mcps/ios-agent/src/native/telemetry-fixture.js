'use strict';
const {installTelemetry} = require('./telemetry');

// Fixed acceptance fixture. ErrorUtils is isolated: never invokes the app's
// crash reporter. Fetch goes through the actual device global-fetch transport.
async function runTelemetryFixture(runtime, metroURL, signal) {
  if (typeof metroURL !== 'string' || !/^https:\/\/[A-Za-z0-9.-]+\.ts\.net:10444\/$/.test(metroURL)) throw new Error('fixture_runtime_required');
  const appHandler = runtime.ErrorUtils?.getGlobalHandler?.();
  let forwarded = 0, handler = function (error, fatal) {
    if (error === synthetic && fatal === false && this === utils) forwarded++;
    return 'forwarded';
  };
  const synthetic = new Error('ios-agent synthetic fixture');
  const utils = {getGlobalHandler: () => handler, setGlobalHandler: value => {handler = value;}};
  const original = handler;
  const isolated = {console: {}, fetch: (...args) => runtime.fetch(...args), ErrorUtils: utils};
  const adapter = installTelemetry(isolated);
  const timers = new Set(), controllers = new Set();
  const abortAll = () => { for (const c of controllers) c.abort(); };
  signal.addEventListener('abort', abortAll);
  const report = {scope: 'isolated-adapter-with-device-global-fetch', checks: {}};
  const request = async (name, mode) => {
    if (signal.aborted) throw new Error('fixture_cancelled');
    const c = new AbortController(); controllers.add(c);
    let timer;
    if (mode === 'cancel') c.abort();
    if (mode === 'timeout') { timer = setTimeout(() => c.abort(), 100); timers.add(timer); }
    try {
      const response = await isolated.fetch(metroURL + 'ios-agent-fixture/' + name, {signal: c.signal});
      return {response, failed: false};
    } catch { return {failed: true}; }
    finally { if (timer !== undefined) { clearTimeout(timer); timers.delete(timer); } controllers.delete(c); }
  };
  adapter.start();
  try {
    report.checks.syntheticHandlerForwarded = utils.getGlobalHandler().call(utils, synthetic, false) === 'forwarded' && forwarded === 1;
    for (const [name, status] of [['ok', 200], ['missing', 404], ['failure', 500]]) {
      const result = await request(name);
      const event = adapter.snapshot().network.slice(-1)[0];
      report.checks['http' + status] = !result.failed && result.response.status === status &&
        result.response.bodyUsed !== true && event?.status === status && event.failed === false;
    }
    report.checks.cancellation = (await request('slow', 'cancel')).failed && adapter.snapshot().network.slice(-1)[0]?.failed === true;
    report.checks.timeout = (await request('slow', 'timeout')).failed && adapter.snapshot().network.slice(-1)[0]?.failed === true;
    const late = request('slow');
    adapter.stop(); adapter.start();
    const lateResult = await late;
    report.checks.lateResultFenced = !lateResult.failed && adapter.snapshot().network.length === 0 && adapter.snapshot().inFlight === 0;
    report.checks.appHandlerUntouched = runtime.ErrorUtils?.getGlobalHandler?.() === appHandler;
    adapter.stop();
    report.checks.historyCleared = adapter.snapshot().network.length === 0 && adapter.snapshot().errors.length === 0;
    report.passed = Object.values(report.checks).every(v => v === true);
    return report;
  } finally {
    abortAll(); for (const timer of timers) clearTimeout(timer);
    signal.removeEventListener('abort', abortAll); adapter.dispose();
    report.checks.isolatedHandlerRestored = utils.getGlobalHandler() === original;
    if (report.passed !== undefined) report.passed = report.passed && report.checks.isolatedHandlerRestored;
  }
}
module.exports = {runTelemetryFixture};
