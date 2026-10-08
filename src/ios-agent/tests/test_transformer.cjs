const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const {createRequire} = require('node:module');

test('real transformer replaces relative external modules only in the explicit dev build',
  {skip: !process.env.IOS_AGENT_MOBILE_ROOT}, async () => {
    const mobile = process.env.IOS_AGENT_MOBILE_ROOT;
    const requireMobile = createRequire(path.join(mobile, 'package.json'));
    const babel = requireMobile('@babel/core');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ios-agent-transform-'));
    const config = {version:1,mobile,metroURL:'https://host.tail.ts.net:10444/',graphqlURL:'https://host.tail.ts.net:10445/development/graphql',webURL:'https://host.tail.ts.net:10446/',routeNames:['Welcome']};
    const file = path.join(dir,'runtime.json'); fs.writeFileSync(file,JSON.stringify(config),{mode:0o600});
    const previous = process.env.IOS_AGENT_RUNTIME_CONFIG;
    process.env.IOS_AGENT_RUNTIME_CONFIG = file;
    try {
      const transformer = require('../native/transformer.cjs');
      const transform = (name,dev=true) => transformer.transform({filename:path.relative(mobile,path.join(__dirname,'../native',name)),src:'module.exports = "placeholder";',plugins:[],options:{projectRoot:mobile,dev,platform:'ios',enableBabelRCLookup:true}});
      const env = await transform('local-env.js');
      const code = babel.transformFromAstSync(env.ast,undefined,{configFile:false,babelrc:false}).code;
      assert.ok(code.includes(config.graphqlURL)); assert.ok(code.includes(config.webURL));
      const runtime = await transform('runtime-config.js');
      assert.ok(babel.transformFromAstSync(runtime.ast,undefined,{configFile:false,babelrc:false}).code.includes(config.metroURL));
      await assert.rejects(async () => transform('local-env.js',false), /development_only/);
      await assert.rejects(async () => transform('runtime-config.js',false), /development_only/);
    } finally {
      if (previous === undefined) delete process.env.IOS_AGENT_RUNTIME_CONFIG; else process.env.IOS_AGENT_RUNTIME_CONFIG=previous;
      fs.rmSync(dir,{recursive:true,force:true});
    }
  });
