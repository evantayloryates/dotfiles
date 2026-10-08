const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createDomainRegistry} = require('../native/domain');

test('inspection is lease-scoped, read-only, bounded and excludes payloads', () => {
  let reads = 0, tick;
  const registry = createDomainRegistry({routeNames: ['Welcome'], schedule: f => {tick=f;return 1;}, cancel() {}});
  const result = {loading: true, networkStatus: 1};
  Object.defineProperty(result, 'data', {get() {throw Error('payload_read');}});
  const query = {getLastResult() {reads++;return result;}, getLastError: () => undefined, getCurrentResult() {throw Error('mutating_read');}};
  registry.registerNavigation(() => 'Welcome');
  registry.registerApollo({getObservableQueries: () => new Map(Array.from({length: 80}, (_,i) => [i,query])), cache: {extract: () => ({ROOT_QUERY: {private: 'secret'}})}});
  assert.equal(reads, 0);
  registry.start();
  const state = registry.snapshot();
  assert.equal(state.navigation.route, 'Welcome');
  assert.equal(state.apollo.activeQueries, 80);
  assert.equal(state.apollo.lastResultStates.length, 64);
  assert.equal(state.apollo.truncated, true);
  assert.equal(state.apollo.cacheRecords, 1);
  assert.equal(JSON.stringify(state).includes('secret'), false);
  registry.stop(); const stoppedReads=reads; tick();
  assert.equal(reads, stoppedReads); assert.equal(registry.snapshot().apollo, undefined);
});

test('replacement registration and late probe completion are fenced', () => {
  let clock = 10;
  const registry = createDomainRegistry({routeNames: ['Welcome'], now: () => clock, schedule: () => 1, cancel() {}});
  const removeOld = registry.registerNavigation(() => 'private-route');
  registry.registerNavigation(() => 'Welcome'); removeOld();
  registry.start(); assert.equal(registry.snapshot().navigation.route, 'Welcome');
  const old = registry.token(); registry.stop(); registry.start();
  registry.recordProbe(old, {httpStatus: 200, graphqlReady: true, outcome: 'ready'});
  assert.equal(registry.snapshot().probe, null);
  registry.recordProbe(registry.token(), {httpStatus: 200, graphqlReady: true, outcome: 'ready', data: 'secret'});
  assert.deepEqual(registry.snapshot().probe, {httpStatus:200,graphqlReady:true,outcome:'ready',ageMs:0});
  clock += 4000; assert.equal(registry.snapshot().probe.ageMs,4000);
});
