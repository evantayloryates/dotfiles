/* Metadata only. Never inspect console arguments, request URLs, bodies or errors. */
'use strict';

const LEVELS = ['log', 'info', 'debug', 'warn', 'error'];
const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const LIMIT = 64;

function createTelemetry({now = Date.now, schedule = setTimeout, cancel = clearTimeout, onChange = () => {}} = {}) {
  let active = false, generation = 0, sequence = 0, timer = null;
  let consoleEvents = [], networkEvents = [], errorEvents = [];
  let counts = {}, dropped = {}, inFlight = 0;
  const reset = () => {
    sequence = 0; consoleEvents = []; networkEvents = []; errorEvents = [];
    counts = Object.fromEntries(LEVELS.map(level => [level, 0]));
    dropped = {console: 0, network: 0, errors: 0}; inFlight = 0;
  };
  reset();
  const emit = () => { try { onChange(); } catch {} };
  const changed = () => {
    if (timer !== null) return;
    timer = schedule(() => { timer = null; emit(); }, 200);
  };
  const clearTimer = () => { if (timer !== null) cancel(timer); timer = null; };
  const append = (list, kind, event) => {
    if (list.length === LIMIT) { list.shift(); dropped[kind] += 1; }
    list.push({sequence: ++sequence, ...event}); changed();
  };
  const elapsed = start => Math.max(0, Math.min(86400000, Math.round(now() - start)));
  const api = {
    isActive() { return active; },
    start() { clearTimer(); generation += 1; active = true; reset(); emit(); },
    stop() { clearTimer(); generation += 1; active = false; reset(); emit(); },
    console(level, stack) {
      if (!active || !LEVELS.includes(level)) return;
      counts[level] += 1;
      // Positions only: no message, path, URL, function name or raw stack export.
      const positions = typeof stack === 'string' ? stack.slice(0, 8192).split('\n').slice(1, 9)
        .map(frame => frame.match(/:(\d{1,7}):(\d{1,7})\)?\s*$/))
        .filter(Boolean).slice(0, 3).map(match => ({line: Number(match[1]), column: Number(match[2])})) : [];
      append(consoleEvents, 'console', {level, positions});
    },
    error(fatal, source = 'runtime') {
      if (active) append(errorEvents, 'errors', {fatal: fatal === true, source: source === 'protocol' ? 'protocol' : 'runtime'});
    },
    fetch(original, receiver, args) {
      if (!active) return original.apply(receiver, args);
      const current = generation, started = now(), observed = active;
      let method = 'GET';
      // Read data descriptors only, so instrumentation does not invoke getters twice.
      try {
        const descriptor = args[1] && Object.getOwnPropertyDescriptor(args[1], 'method');
        if (descriptor) method = typeof descriptor.value === 'string' && METHODS.has(descriptor.value.toUpperCase()) ? descriptor.value.toUpperCase() : 'OTHER';
        else if (typeof args[0] !== 'string') method = 'OTHER';
      } catch { method = 'OTHER'; }
      if (observed) { inFlight += 1; changed(); }
      const complete = (response, failed) => {
        if (!observed || !active || generation !== current) return;
        inFlight -= 1;
        let status = null;
        try { const value = failed ? null : response?.status; if (Number.isInteger(value) && value >= 0 && value <= 599) status = value; } catch {}
        append(networkEvents, 'network', {method, status, failed, durationMs: elapsed(started)});
      };
      let result;
      try { result = original.apply(receiver, args); }
      catch (error) { try { complete(null, true); } catch {} throw error; }
      if (!observed) return result;
      // Chain rather than mark the caller's promise handled with a detached observer.
      // The returned promise preserves response/error identity, including unhandled rejection behavior.
      return result.then(response => {
        try { complete(response, false); } catch {}
        return response;
      }, error => {
        try { complete(null, true); } catch {}
        throw error;
      });
    },
    snapshot() {
      return {active, scope: 'current-lease', limit: LIMIT, counts: {...counts}, dropped: {...dropped}, inFlight,
        console: consoleEvents.map(event => ({...event, positions: event.positions.map(position => ({...position}))})),
        network: networkEvents.map(event => ({...event})), errors: errorEvents.map(event => ({...event})),
        contentExported: false, networkCoverage: 'global-fetch-only', callSiteCoverage: 'numeric-positions-only'};
    },
  };
  return api;
}

function installTelemetry(runtime, options) {
  const telemetry = createTelemetry(options), undo = [];
  for (const level of LEVELS) {
    const original = runtime.console?.[level];
    if (typeof original !== 'function') continue;
    const wrapper = function (...args) {
      try { if (telemetry.isActive()) telemetry.console(level, new Error().stack); } catch {}
      return original.apply(this, args);
    };
    runtime.console[level] = wrapper;
    undo.push(() => { if (runtime.console[level] === wrapper) runtime.console[level] = original; });
  }
  if (typeof runtime.fetch === 'function') {
    const original = runtime.fetch;
    const wrapper = function (...args) { return telemetry.fetch(original, this, args); };
    runtime.fetch = wrapper;
    undo.push(() => { if (runtime.fetch === wrapper) runtime.fetch = original; });
  }
  const errorUtils = runtime.ErrorUtils;
  if (typeof errorUtils?.getGlobalHandler === 'function' && typeof errorUtils?.setGlobalHandler === 'function') {
    const original = errorUtils.getGlobalHandler();
    if (typeof original === 'function') {
      const wrapper = function (error, fatal) {
        try { telemetry.error(fatal); } catch {}
        return original.apply(this, arguments);
      };
      errorUtils.setGlobalHandler(wrapper);
      undo.push(() => { if (errorUtils.getGlobalHandler() === wrapper) errorUtils.setGlobalHandler(original); });
    }
  }
  return {...telemetry, dispose() { telemetry.stop(); for (const restore of undo.reverse()) restore(); }};
}

module.exports = {createTelemetry, installTelemetry};
