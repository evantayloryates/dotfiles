// Recovery admission evidence only. Never dispatch or mark unknown work settled.
import {readdirSync} from 'node:fs'
import {join} from 'node:path'
import {BROKER_DIR} from './state.mjs'
import {inspectRequest} from './requests.mjs'
export function auditRequests({limit=1024,list=()=>readdirSync(join(BROKER_DIR,'requests')),inspect=id=>inspectRequest(id,{allowUnavailableReceipt:true})}={}){
 if(!Number.isInteger(limit)||limit<1||limit>4096)throw Error('invalid audit limit')
 let names
 try{names=list().filter(x=>/^[A-Za-z0-9_-]{1,100}\.json$/.test(x)).sort()}catch{return {complete:false,reason:'request-inventory-unavailable',total:null,inspected:0,unresolved:[],counts:{},settledForHandoff:false}}
 const rows=[],counts={}
 for(const name of names.slice(0,limit)){
  const id=name.slice(0,-5)
  let row
  try{
   const r=inspect(id)
   row={requestId:id,state:r.state,receiptVerified:r.receiptVerified===true,retrySafe:r.retrySafe===true,dispatched:r.dispatched===true,...(r.receiptObservation?.available===false?{receiptUnavailable:true,category:'outcome_unknown',controlState:r.controlState}:{})}
  }catch(e){row={requestId:id,state:'inspection-refused',receiptVerified:false,retrySafe:false,category:typeof e.category==='string'&&/^[a-z_]{1,64}$/.test(e.category)?e.category:'internal'}}
  rows.push(row);counts[row.state]=(counts[row.state]||0)+1
 }
 const unresolved=rows.filter(r=>!r.receiptVerified&&!r.retrySafe),complete=rows.length===names.length
 return {schemaVersion:1,observedAt:new Date().toISOString(),complete,reason:complete?'request-inventory-inspected':'request-audit-budget-exhausted',total:names.length,inspected:rows.length,counts,unresolved,settledForHandoff:complete&&!unresolved.length,verification:'Receipt and safe-retry boundary only; no application or replay claim'}
}
