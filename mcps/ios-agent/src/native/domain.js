'use strict';

function createDomainRegistry({routeNames = [], now = Date.now, schedule = setInterval, cancel = clearInterval, onChange = () => {}} = {}) {
  const names = new Set(routeNames);
  let apollo, navigation, timer, active = false, generation = 0, observedAt = null, values = {}, probe = null, probeAt = null;
  // This is a bounded receipt buffer, not a transport. The existing state
  // command carries it to the host; sequence numbers make repeated reads safe.
  const signalStream = `${now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`;
  let signalSequence = 0, signalDropped = 0, lastSignalPublishAt = -Infinity;
  const signals = [];
  const token = value => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(value) ? value : undefined;
  const identifier = value => typeof value === 'string' && /^[a-fA-F0-9-]{8,64}$/.test(value) ? value : undefined;
  const stringFields = new Set(['level', 'outcome', 'reason', 'code', 'surface', 'phase', 'route', 'appState', 'state', 'status',
    'routeName', 'previousRouteName', 'operationName', 'kind', 'fromState', 'toState']);
  const idFields = new Set(['traceId', 'requestId', 'sessionId', 'ownerId', 'pageId', 'buildId', 'deliveryId']);
  const numberFields = new Set(['durationMs', 'count', 'attempts', 'httpStatus', 'networkStatus', 'statusCode', 'errorCount']);
  const emit = () => { try { onChange(); } catch {} };
  const sample = () => {
    if (!active) return;
    const next = {};
    if (navigation) {
      try { const name = navigation(); next.navigation = {registered: true, route: names.has(name) ? name : 'unknown'}; }
      catch { next.navigation = {registered: true, unavailable: true}; }
    }
    if (apollo) {
      try {
        const queries = apollo.getObservableQueries('active');
        const states = [];
        // Last emitted results only. Never call getCurrentResult, refetch, or read variables/data.
        for (const query of queries.values()) {
          if (states.length === 64) break;
          const result = query.getLastResult();
          states.push({loading: result?.loading === true,
            networkStatus: [1, 2, 3, 4, 6, 7, 8].includes(result?.networkStatus) ? result.networkStatus : null,
            errored: Boolean(query.getLastError())});
        }
        next.apollo = {registered: true, activeQueries: queries.size,
          cacheRecords: Object.keys(apollo.cache.extract(false)).length,
          lastResultStates: states, truncated: queries.size > states.length};
      } catch { next.apollo = {registered: true, unavailable: true}; }
    }
    values = next; observedAt = now(); emit();
  };
  return {
    signal(event, fields = {}) {
      try {
        if (!token(event) || !event.includes('.') || !fields || typeof fields !== 'object' || Array.isArray(fields)) return;
        const clean = {};
        let inspected = 0;
        for (const key in fields) {
          if (!Object.prototype.hasOwnProperty.call(fields, key)) continue;
          if (++inspected > 16) break;
          const value = fields[key];
          if (stringFields.has(key)) {
            if (['routeName', 'previousRouteName'].includes(key)) {
              if (value === 'unknown' || names.has(value)) clean[key] = value;
              continue;
            }
            const safe = token(value);
            if (!safe) continue;
            if (key === 'kind' && !['query', 'mutation', 'subscription', 'unknown'].includes(safe)) continue;
            if (['fromState', 'toState'].includes(key) && !['active', 'inactive', 'background', 'unknown'].includes(safe)) continue;
            if (key === 'level' && !['info', 'warn', 'error'].includes(safe)) continue;
            clean[key] = safe;
          }
          else if (idFields.has(key)) { const safe = identifier(value); if (safe) clean[key] = safe; }
          else if (numberFields.has(key) && Number.isFinite(value) && value >= 0 && value <= 1e7 &&
            (key !== 'statusCode' || Number.isInteger(value) && value >= 100 && value <= 599) &&
            (key !== 'errorCount' || Number.isInteger(value) && value <= 20)) clean[key] = value;
        }
        const sourceAtMs = now();
        signals.push({sequence: ++signalSequence, event, fields: clean, sourceAtMs});
        if (signals.length > 32) { signals.shift(); signalDropped++; }
        // Publish the first transition promptly, then let the normal one-second
        // sample carry bursts without rebuilding the full bridge state per call.
        if (sourceAtMs - lastSignalPublishAt >= 1000) { lastSignalPublishAt = sourceAtMs; emit(); }
      } catch {} // Instrumentation must not affect the app.
    },
    registerApollo(client) { apollo = client; sample(); if (!active) emit(); return () => { if (apollo === client) { apollo = undefined; sample(); if (!active) emit(); } }; },
    registerNavigation(readRoute) { navigation = readRoute; sample(); if (!active) emit(); return () => { if (navigation === readRoute) { navigation = undefined; sample(); if (!active) emit(); } }; },
    registered() { return Boolean(apollo && navigation); },
    start() { if (timer !== undefined) cancel(timer); generation++; active = true; probe = null; probeAt = null; sample(); timer = schedule(sample, 1000); },
    stop() { if (timer !== undefined) cancel(timer); timer = undefined; generation++; active = false; values = {}; observedAt = null; probe = null; probeAt = null; emit(); },
    token() { return generation; },
    recordProbe(token, record) {
      if (!active || token !== generation) return;
      probe = {httpStatus: Number.isInteger(record.httpStatus) && record.httpStatus >= 0 && record.httpStatus <= 599 ? record.httpStatus : null,
        graphqlReady: record.graphqlReady === true, outcome: ['ready', 'network', 'shape'].includes(record.outcome) ? record.outcome : 'shape'};
      probeAt = now(); emit();
    },
    snapshot() { return {active, observedAt, ageMs: observedAt === null ? null : Math.max(0, now() - observedAt),
      ...JSON.parse(JSON.stringify(values)), probe: probe && {...probe, ageMs: Math.max(0, now() - probeAt)},
      coverage: 'registered-navigation-and-Apollo-last-results', payloadsExported: false}; },
    signalSnapshot() { return {stream: signalStream, dropped: signalDropped, records: signals.slice()}; },
  };
}
module.exports = {createDomainRegistry};
