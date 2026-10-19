const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createDomainRegistry} = require('../src/native/domain');

test('startup registration changes publish while idle without reading app state', () => {
  let events=0;
  const registry=createDomainRegistry({onChange:()=>events++});
  assert.equal(registry.registered(),false);
  const removeOld=registry.registerNavigation(()=>{throw Error('idle_route_read');});
  const removeApollo=registry.registerApollo({getObservableQueries(){throw Error('idle_query_read');}});
  assert.equal(registry.registered(),true);
  registry.registerNavigation(()=>{throw Error('replacement_idle_read');});
  removeOld(); assert.equal(registry.registered(),true);
  assert.equal(events,3);
  removeApollo(); assert.equal(registry.registered(),false);
  assert.equal(registry.snapshot().active,false);
  assert.equal(registry.snapshot().navigation,undefined);
});

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

test('signal queue is bounded, metadata-only and no-throw', () => {
  let publishes = 0;
  const registry = createDomainRegistry({now: () => 1000, onChange() {publishes++;}});
  registry.signal('kck.call.started', {outcome: 'accepted', requestId: 'a'.repeat(32),
    url: 'https://private.example/?token=secret', body: 'secret', reason: 'contains a secret'});
  assert.deepEqual(registry.signalSnapshot().records[0].fields,
    {outcome: 'accepted', requestId: 'a'.repeat(32)});
  registry.signal('bad event', {outcome: 'ignored'});
  registry.signal('kck.call.ended', Object.defineProperty({}, 'outcome', {enumerable: true, get() {throw Error('bad getter');}}));
  for (let i = 0; i < 40; i++) registry.signal('kck.call.step', {count: i});
  const snapshot = registry.signalSnapshot();
  assert.equal(snapshot.records.length, 32);
  assert.equal(snapshot.dropped, 9);
  assert.equal(snapshot.records[0].sequence, 10);
  assert.equal(snapshot.records.at(-1).fields.count, 39);
  assert.equal(publishes, 1);
});

test('Kickoff native signal fields retain static route and operation metadata', () => {
  const registry = createDomainRegistry({routeNames: ['Welcome', 'ClientCall']});
  registry.signal('navigation.route_changed', {routeName: 'ClientCall', previousRouteName: 'Welcome',
    operationName: 'ClientSummary', kind: 'query', fromState: 'inactive', toState: 'active',
    statusCode: 200, errorCount: 2, pageURL: 'https://private.example/secret'});
  assert.deepEqual(registry.signalSnapshot().records[0].fields, {
    routeName: 'ClientCall', previousRouteName: 'Welcome', operationName: 'ClientSummary', kind: 'query',
    fromState: 'inactive', toState: 'active', statusCode: 200, errorCount: 2});
});
