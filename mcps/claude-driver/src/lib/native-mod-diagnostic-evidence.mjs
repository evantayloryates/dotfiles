import {MOD_PROBE as ORIGINAL,screenProbeReport as report,screenProbeState as state} from './native-mod-probe-evidence.mjs'
export {readProbeBytes,probePathPresence} from './native-mod-probe-evidence.mjs'
export const MOD_PROBE=Object.freeze({...ORIGINAL,id:'94701894-fc71-4dfa-943e-f5a1cc3fc8b8',version:'0.3.0',diagnostic:true,scope:'owned-native-mod-read-diagnostic',notBefore:Date.parse('2026-10-07T14:39:28.949Z'),reportName:'native-mod-diagnostic-94701894-fc71-4dfa-943e-f5a1cc3fc8b8.report.json',files:Object.freeze({
 '.claude-plugin/plugin.json':'3c7204482709c2db48151475e82f44d0dd8af2c53061acc5554b0fce2e6c3ea7',
 'hooks/hooks.json':'448e29b17c4ce3ee767d3caf0ff9e35b5501b1cfb3b59952e7b7625744bbf070',
 'hooks/register.js':'409fe3a6a4207e7a7ec9a2f29d4440425c7b1ce1e650896b2b9dd3908873959e'})})
export const screenProbeReport=(bytes,options)=>report(bytes,{...options,experiment:MOD_PROBE})
export const screenProbeState=options=>state({...options,experiment:MOD_PROBE})
