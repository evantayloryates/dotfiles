// Build-time only; never bundled into the app. Device receives URLs and code enums.
const fs = require('node:fs');
const path = require('node:path');
function readConfig() {
  const location = process.env.IOS_AGENT_RUNTIME_CONFIG;
  if (!location) return null;
  const stat = fs.statSync(location);
  if (stat.mode & 0o077 || stat.size > 16384) throw new Error('runtime_config_must_be_small_and_private');
  const value = JSON.parse(fs.readFileSync(location, 'utf8'));
  if (value.version !== 1 || path.resolve(value.mobile) !== path.resolve(process.env.IOS_AGENT_MOBILE_ROOT)) throw new Error('runtime_mobile_mismatch');
  const hosts = new Set();
  for (const [key, port] of [['metro', 10444], ['graphql', 10445], ['web', 10446]]) {
    if (typeof value[key + 'URL'] !== 'string' || /[^\x21-\x7e]|\\/.test(value[key + 'URL'])) throw new Error('runtime_private_tailnet_URL_required');
    const url = new URL(value[key + 'URL']);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.ts.net') || url.port !== String(port) || url.username || url.password || url.search || url.hash || url.pathname !== (key === 'graphql' ? '/development/graphql' : '/')) throw new Error('runtime_private_tailnet_URL_required');
    hosts.add(url.hostname);
  }
  if (hosts.size !== 1 || !Array.isArray(value.routeNames) || value.routeNames.length > 256 || value.routeNames.some(n => typeof n !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(n))) throw new Error('runtime_endpoint_or_routes_invalid');
  return {metroURL: value.metroURL, graphqlURL: value.graphqlURL, webURL: value.webURL, routeNames: [...new Set(value.routeNames)].sort()};
}
module.exports = {readConfig};
