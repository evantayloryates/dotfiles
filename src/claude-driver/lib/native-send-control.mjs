import {createHash} from 'node:crypto'
import {metadataTargetPreflightMatches} from './native-metadata-control.mjs'
export function nativeSendArguments(target,message){
 if(!target||typeof message!=='string'||!message||message!==message.trim()||message.includes('\0')||message.length>16000)throw Error('native send arguments unqualified')
 return {session_id:target.sessionId,message}
}
export function nativeSendTargetMatches(args){
 const p=args?.peer;if(!p||!['idle','working','busy','running'].includes(p.status))return false
 return metadataTargetPreflightMatches({...args,peer:{...p,status:'idle'}})
}
// Exact reviewed app acceptance text. This is never recipient application proof.
export function nativeSendAcceptance(receipt,target){
 if(receipt?.isError!==false||!Array.isArray(receipt.content)||receipt.content.length!==1||receipt.content[0]?.type!=='text'||typeof receipt.content[0].text!=='string'||!/^local_[a-f0-9-]{36}$/.test(target||''))return null
 const text=receipt.content[0].text;if(text.length>4096||/[\r\n]/.test(text))return null
 const id='([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})',label=target+'(?: \\([^\\r\\n]*\\))?'
 const delivered=text.match(new RegExp('^Message delivered to session '+label+'; its turn has started on it\\. \\(delivery: delivered; message_id: '+id+'\\)$'))
 if(delivered)return {delivery:'delivered',messageId:delivered[1],nativeAccepted:true,applied:false}
 const queued=text.match(new RegExp('^Message queued for session '+label+': [^\\r\\n]{1,500}\\. Don\\\'t wait on it; check back with list_events if the outcome matters\\. \\(delivery: queued; message_id: '+id+'\\)$'))
 return queued?{delivery:'queued',messageId:queued[1],nativeAccepted:true,applied:false}:null
}
// App-native host injection omits its returned message ID from the recipient
// journal. Report sender/body correlation separately; never invent UUID linkage.
export function nativeHostPeerEvidence(row){
 if(row?.type!=='user'||row.origin?.kind!=='peer'||row.origin?.hostInjected!==true||row.turnOrigin!=='peer'||!/^local_[a-f0-9-]{36}$/.test(row.origin.from||''))return null
 const text=row.message?.content;if(typeof text!=='string'||text.length>24000)return null
 const match=text.match(/^Another Claude session sent a message:\n<cross-session-message from="(local_[a-f0-9-]{36})" name="[^"\n]{0,300}">\n([\s\S]*?)\n<\/cross-session-message>\n\n/)
 if(!match||match[1]!==row.origin.from||match[2].includes('</cross-session-message>')||match[2].length>16000)return null
 return {sender:row.origin.from,bodySha256:createHash('sha256').update(match[2]).digest('hex'),messageIdAvailable:false}
}
export function nativeSendUserReceipt(events,expected){
 if(!Array.isArray(events))return null
 const users=events.filter(e=>e.type==='user'&&!e.sidechain)
 if(typeof expected==='string')return users.length===1&&users[0].peerMessageId===expected?users[0]:null
 if(!expected||!/^local_[a-f0-9-]{36}$/.test(expected.sender||'')||typeof expected.message!=='string')return null
 const hash=createHash('sha256').update(expected.message).digest('hex'),peers=users.filter(e=>e.nativeHostPeer)
 return peers.length===1&&peers[0].nativeHostPeer.sender===expected.sender&&peers[0].nativeHostPeer.bodySha256===hash?peers[0]:null
}
export function nativeSendReplyObserved(events,marker,expected){
 if(!Array.isArray(events)||typeof marker!=='string'||events.some(e=>e.type==='assistant'&&e.tools?.length))return false
 const user=nativeSendUserReceipt(events,expected),nodes=new Map(events.filter(e=>e.id&&!e.sidechain).map(e=>[e.id,e]))
 if(!user)return false
 return events.some(e=>{if(e.type!=='assistant'||e.sidechain||e.text?.trim()!==marker||e.stopReason!=='end_turn')return false;const seen=new Set();let n=e;for(let i=0;i<64;i++){if(n.parentId===user.id)return true;if(!n.parentId||seen.has(n.parentId))return false;seen.add(n.parentId);n=nodes.get(n.parentId);if(!n||n.type==='user')return false}return false})
}
