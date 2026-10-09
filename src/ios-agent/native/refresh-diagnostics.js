/* Dev-only, content-free observation. Preserve React Refresh behavior exactly. */
const REASONS = new Map([
  ['No root boundary', 'no-root-boundary'], ['Dependency cycle', 'dependency-cycle'],
  ['No longer a boundary', 'no-longer-a-boundary'], ['Invalidated boundary', 'invalidated-boundary'],
]);
function installRefreshDiagnostics(target, record) {
  const refresh = target[(target.__METRO_GLOBAL_PREFIX__ || '') + '__ReactRefresh'];
  if (!refresh || refresh.__iosAgentObserved) return false;
  if (typeof refresh.performFullRefresh !== 'function' || typeof refresh.performReactRefresh !== 'function') return false;
  const full = refresh.performFullRefresh, fast = refresh.performReactRefresh;
  const report = event => { try { record(event); } catch {} };
  refresh.performFullRefresh = function(reason, ...rest) {
    let code = 'other';
    if (typeof reason === 'string') {
      for (const [text, value] of REASONS) {
        if (reason.startsWith('Fast Refresh - ' + text + ' <')) { code = value; break; }
      }
    }
    report({kind: 'full-reload', reason: code});
    return full.call(this, reason, ...rest);
  };
  refresh.performReactRefresh = function(...args) {
    const value = fast.apply(this, args);
    report({kind: 'react-refresh', reason: 'component-update'});
    return value;
  };
  refresh.__iosAgentObserved = true;
  return true;
}
module.exports = {installRefreshDiagnostics};
