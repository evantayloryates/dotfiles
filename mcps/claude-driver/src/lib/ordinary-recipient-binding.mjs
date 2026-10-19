import {ordinaryStopEpochValid,ordinaryStopPeerMatches} from './ordinary-stop-control.mjs'
const exact=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).sort().join(',')===keys
export function ordinaryRecipientValid(r){return !!(exact(r,'kind')&&r.kind==='no-peer'||exact(r,'epoch,kind')&&r.kind==='epoch'&&ordinaryStopEpochValid(r.epoch))}
// Registry observation only, never a crash cause or universal OS absence claim.
export function captureOrdinaryRecipient(binding,peer,processes){
 if(!Array.isArray(processes)||processes.length>2048)throw Error('recipient registry observation unavailable')
 const same=processes.filter(p=>p?.hostSessionId===binding.sessionId)
 if(peer===null&&same.length===0)return {kind:'no-peer'}
 const epoch={pid:peer?.pid,procStart:peer?.procStart}
 if(same.length!==1||same[0].pid!==epoch.pid||same[0].procStart!==epoch.procStart||!ordinaryStopPeerMatches(binding,epoch,peer))throw Error('recipient epoch ambiguous or unqualified')
 return {kind:'epoch',epoch}
}
export function ordinaryRecipientMatches(binding,expected,peer,processes){
 try{return ordinaryRecipientValid(expected)&&JSON.stringify(captureOrdinaryRecipient(binding,peer,processes))===JSON.stringify(expected)}catch{return false}
}
