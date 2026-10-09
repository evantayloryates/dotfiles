const {test} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const zlib = require('node:zlib');
const path = require('node:path');
const {createRequire} = require('node:module');
const {bundleMiddleware} = require('../native/bundle-middleware.cjs');

test('streamed RN multipart survives negotiated compression without changing its payload',
  {skip: !process.env.IOS_AGENT_MOBILE_ROOT}, async () => {
    const requireMobile = createRequire(path.join(process.env.IOS_AGENT_MOBILE_ROOT, 'package.json'));
    const js = 'globalThis.synthetic = "' + 'bounded fixture;'.repeat(100000) + '";';
    const body = Buffer.from('--fixture\r\nContent-Type: application/json\r\n\r\n{"done":1}\r\n' +
      '--fixture\r\nContent-Type: application/javascript\r\n\r\n' + js + '\r\n--fixture--\r\n');
    const server = http.createServer(bundleMiddleware((req, res) => {
      const type = req.url.includes('error=1') ? 'application/json' : 'multipart/mixed; boundary="fixture"';
      res.writeHead(req.url.includes('error=1') ? 500 : 200, {'Content-Type':type});
      // Actual streaming writes, including the RN progress part and final JS.
      res.write(body.subarray(0, 150)); res.end(body.subarray(150));
    }, requireMobile('compression')));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const get = (url, encoding, method='GET') => new Promise((resolve,reject) => {
      const req = http.request({host:'127.0.0.1',port:server.address().port,path:url,method,
        headers:{'Accept-Encoding':encoding}}, res => {
          const chunks=[];res.on('data',x=>chunks.push(x));res.on('error',reject);
          res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));
        }); req.on('error',reject);req.end();
    });
    try {
      const compressed = await get('/index.bundle?platform=ios', 'gzip');
      assert.equal(compressed.headers['content-encoding'],'gzip');
      assert.equal(compressed.headers['content-type'],'multipart/mixed; boundary="fixture"');
      assert.match(compressed.headers.vary,/Accept-Encoding/);
      assert.equal(compressed.status,200);
      assert.deepEqual(zlib.gunzipSync(compressed.body),body);
      assert.ok(compressed.body.length < body.length/10);
      const plain = await get('/index.bundle', 'gzip;q=0, deflate;q=0, br;q=0, identity');
      assert.equal(plain.headers['content-encoding'],undefined);
      assert.deepEqual(plain.body,body);
      for (const [url,method] of [['/status','GET'],['/index.bundle','HEAD'],['/index.bundle','POST'],['/index.bundle?error=1','GET']]) {
        const response = await get(url,'gzip',method);
        assert.equal(response.headers['content-encoding'],undefined);
        if(method!=='HEAD')assert.deepEqual(response.body,body);
        if(url.includes('error'))assert.equal(response.status,500);
      }
    } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  });
