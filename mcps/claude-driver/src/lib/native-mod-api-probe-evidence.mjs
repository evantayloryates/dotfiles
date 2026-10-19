import {screenProbeReport as report,screenProbeState as state} from './native-mod-probe-evidence.mjs'
import {MOD_PROBE as ORIGINAL} from './native-mod-diagnostic-evidence.mjs'
export {readProbeBytes,probePathPresence} from './native-mod-probe-evidence.mjs'
export const MOD_PROBE=Object.freeze({...ORIGINAL,id:'7a8c9749-49fc-4894-9756-5f321bcc7c77',version:'0.4.0',scope:'owned-native-mod-api-probe',notBefore:Date.parse('2026-10-07T14:50:33.660Z'),reportName:'native-mod-api-probe-7a8c9749-49fc-4894-9756-5f321bcc7c77.report.json',files:Object.freeze({".claude-plugin/plugin.json":"49ada84909a2c348b0c93ad44d55ce80b3ffdf20ce1df2ea9cebc486860b6bb4","hooks/hooks.json":"448e29b17c4ce3ee767d3caf0ff9e35b5501b1cfb3b59952e7b7625744bbf070","hooks/register.js":"73828399d5f87e9edd2d8505797db7683275e0e15bc36a6f155ba2e9032c4d49"})})
export const screenProbeReport=(bytes,options)=>report(bytes,{...options,experiment:MOD_PROBE})
export const screenProbeState=options=>state({...options,experiment:MOD_PROBE})
