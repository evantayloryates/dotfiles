// Explicit developer build adapter. The app's normal Metro config stays unchanged.
const path = require('node:path');
const {createRequire} = require('node:module');
const mobile = process.env.IOS_AGENT_MOBILE_ROOT;
if (!mobile) throw new Error('IOS_AGENT_MOBILE_ROOT required');
const runtime = require('./runtime-config.cjs').readConfig();
const requireMobile = createRequire(path.join(mobile, 'package.json'));
const config = requireMobile(path.join(mobile, 'metro.config.js'));
const root = path.resolve(__dirname, '..');
config.watchFolders = [...(config.watchFolders || []), root];
config.resolver.nodeModulesPaths = [...(config.resolver.nodeModulesPaths || []), path.join(mobile, 'node_modules')];
const previous = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, name, platform) => {
  if (runtime && name.startsWith('.') && path.resolve(path.dirname(context.originModulePath), name) === path.join(mobile, 'local-env.js')) {
    return {type: 'sourceFile', filePath: path.join(__dirname, 'local-env.js')};
  }
  // A single React renderer and React Native runtime across the external prelude.
  const origin = name === 'react' || name.startsWith('react/') || name === 'react-native' || name.startsWith('react-native/')
    ? {...context, originModulePath: path.join(mobile, 'index.js')} : context;
  return previous ? previous(origin, name, platform) : context.resolveRequest(origin, name, platform);
};
config.transformer.babelTransformerPath = path.join(__dirname, 'transformer.cjs');
module.exports = config;
