'use strict';

function createDomainRegistry({routeNames = [], now = Date.now, schedule = setInterval, cancel = clearInterval, onChange = () => {}} = {}) {
  const names = new Set(routeNames);
  let apollo, navigation, timer, active = false, generation = 0, observedAt = null, values = {}, probe = null, probeAt = null;
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
  };
}
module.exports = {createDomainRegistry};
