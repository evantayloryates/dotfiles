const {test} = require('node:test');
const assert = require('node:assert/strict');
const {installRefreshDiagnostics} = require('../native/refresh-diagnostics');
test('refresh observation preserves receiver, arguments, results and content boundary', () => {
  const events = [], calls = [], refresh = {
    performFullRefresh(...args) { calls.push({receiver: this, args}); return 17; },
    performReactRefresh(...args) { calls.push({receiver: this, args}); return 23; },
  };
  const global = {__METRO_GLOBAL_PREFIX__: 'custom', custom__ReactRefresh: refresh};
  assert.equal(installRefreshDiagnostics(global, event => events.push(event)), true);
  assert.equal(installRefreshDiagnostics(global, () => assert.fail('duplicate observation')), false);
  const privateReason = 'Fast Refresh - Invalidated boundary </private/source.tsx> </private/parent.tsx>';
  assert.equal(refresh.performFullRefresh(privateReason, 4), 17);
  assert.equal(refresh.performReactRefresh(8), 23);
  assert.equal(calls[0].receiver, refresh);
  assert.deepEqual(calls.map(x => x.args), [[privateReason, 4], [8]]);
  assert.deepEqual(events, [{kind:'full-reload', reason:'invalidated-boundary'}, {kind:'react-refresh', reason:'component-update'}]);
  assert.equal(JSON.stringify(events).includes('private'), false);
});
test('observation failures never replace runtime failures or interfere with reload', () => {
  const original = Error('synthetic');
  const refresh = {performFullRefresh() { throw original; }, performReactRefresh() { throw original; }};
  installRefreshDiagnostics({__ReactRefresh: refresh}, () => {throw Error('observer');});
  assert.throws(() => refresh.performFullRefresh('unrecognized-private-value'), e => e === original);
  assert.throws(() => refresh.performReactRefresh(), e => e === original);
  assert.equal(installRefreshDiagnostics({}, () => {}), false);
});
