'use strict';
// Only the explicit development Metro server uses this adapter. Preserve the
// decoded RN multipart protocol; never buffer bundles or compress app API data.
function bundleMiddleware(next, compression) {
  const encode = compression({level: 4, threshold: 1024, filter: (_req, res) => {
    const type = String(res.getHeader('Content-Type') || '').split(';')[0].trim();
    return ['multipart/mixed', 'application/javascript', 'text/javascript'].includes(type);
  }});
  return (req, res) => {
    if (req.method !== 'GET' || req.url.split('?')[0] !== '/index.bundle') return next(req, res);
    return encode(req, res, () => next(req, res));
  };
}
module.exports = {bundleMiddleware};
