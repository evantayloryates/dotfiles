import {readProbeBytes,probePathPresence} from './native-mod-probe-evidence.mjs'
// New bootstrap records are per-request; old runtimes have only a shared entry.
// Corrupt retained evidence never enables a fallback to weaker shared evidence.
export function readNativeCompletedCheck(dir,requestId,generation){
 if(typeof dir!=='string'||!dir.startsWith('/')||! /^[A-Za-z0-9_-]{1,200}$/.test(requestId)||!Number.isInteger(generation)||generation<1)throw Error('invalid completed checkpoint identity')
 const scoped=dir+'/broker-check-'+requestId+'-0-g'+generation+'.completed.json',presence=probePathPresence(scoped)
 if(presence===null)throw Error('completed checkpoint unavailable')
 const source=presence===false?'legacy-shared':'request-scoped'
 const entry=JSON.parse(readProbeBytes(source==='legacy-shared'?dir+'/broker-check-entry.json':scoped,16384).bytes.toString('utf8'))
 if(entry?.phase!=='completed'||entry.requestId!==requestId||entry.generation!==generation||(entry.index!==0&&Object.hasOwn(entry,'index')))throw Error('completed checkpoint identity mismatch')
 return {entry,source}
}
