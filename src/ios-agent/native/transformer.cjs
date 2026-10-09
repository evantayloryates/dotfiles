const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const {createRequire} = require('node:module');
const mobile = process.env.IOS_AGENT_MOBILE_ROOT;
if (!mobile) throw new Error('IOS_AGENT_MOBILE_ROOT required');
const upstream = createRequire(path.join(mobile, 'package.json'))('@react-native/metro-babel-transformer');
const prelude = path.join(__dirname, 'bridge.js');
const runtime = require('./runtime-config.cjs').readConfig();
module.exports = {
  ...upstream,
  getCacheKey() {
    const hash = crypto.createHash('sha256');
    for (const file of ['transformer.cjs', 'bridge.js', 'telemetry.js', 'domain.js', 'runtime-config.js', 'runtime-config.cjs', 'runtime-marker.js', 'refresh-diagnostics.js']) hash.update(fs.readFileSync(path.join(__dirname, file)));
    hash.update(JSON.stringify(runtime));
    return String(upstream.getCacheKey?.() || '') + hash.digest('hex');
  },
  transform(args) {
    const filename = path.resolve(args.options?.projectRoot || mobile, args.filename);
    if (runtime && filename === path.join(__dirname, 'local-env.js')) {
      if (!args.options?.dev) throw new Error('remote_local_env_development_only');
      args = {...args, src: `module.exports = ${JSON.stringify({LOCAL_GRAPHQL_URL: runtime.graphqlURL, LOCAL_WEB_URL: runtime.webURL})};`};
    } else if (runtime && filename === path.join(__dirname, 'runtime-config.js')) {
      if (!args.options?.dev) throw new Error('remote_runtime_development_only');
      args = {...args, src: `module.exports = ${JSON.stringify(runtime)};`};
    }
    if (args.options?.dev && filename === path.join(mobile, 'index.js')) {
      args = {...args, src: `require(${JSON.stringify(prelude)});\n` + args.src};
    }
    return upstream.transform(args);
  },
};
