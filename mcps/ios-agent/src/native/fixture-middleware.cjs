'use strict';
// Immutable synthetic responses on the opt-in loopback Metro server only.
// Never proxies, reads app data, accepts a caller URL, or logs a request.
function fixtureMiddleware(next) {
  let waiting = 0;
  return (req, res) => {
    const routes = {'/ios-agent-fixture/ok': 200, '/ios-agent-fixture/missing': 404,
      '/ios-agent-fixture/failure': 500, '/ios-agent-fixture/slow': 200};
    if (req.method !== 'GET' || !Object.hasOwn(routes, req.url)) return next(req, res);
    const slow = req.url === '/ios-agent-fixture/slow';
    if (slow && waiting >= 2) { res.writeHead(429); res.end('{}'); return; }
    const send = () => {
      if (res.destroyed) return;
      res.writeHead(routes[req.url], {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
      res.end('{}');
    };
    if (!slow) { send(); return; }
    waiting++;
    let finished = false;
    const retire = () => { if (!finished) { finished = true; waiting--; clearTimeout(timer); } };
    const timer = setTimeout(() => { send(); retire(); }, 1000);
    res.once('close', retire);
  };
}
module.exports = {fixtureMiddleware};
