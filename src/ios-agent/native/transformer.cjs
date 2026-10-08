const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const {createRequire} = require('node:module');
const mobile = process.env.IOS_AGENT_MOBILE_ROOT;
if (!mobile) throw new Error('IOS_AGENT_MOBILE_ROOT required');
const upstream = createRequire(path.join(mobile, 'package.json'))('@react-native/metro-babel-transformer');
const prelude = path.join(__dirname, 'bridge.js');
module.exports = {
  ...upstream,
  getCacheKey() {
    const hash = crypto.createHash('sha256');
    for (const file of [prelude, path.join(__dirname, 'telemetry.js')]) hash.update(fs.readFileSync(file));
    return String(upstream.getCacheKey?.() || '') + hash.digest('hex');
  },
  transform(args) {
    if (args.options?.dev && (args.filename === 'index.js' || args.filename === path.join(mobile, 'index.js'))) {
      args = {...args, src: `require(${JSON.stringify(prelude)});\n` + args.src};
    }
    return upstream.transform(args);
  },
};
