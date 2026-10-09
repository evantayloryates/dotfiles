import {EngineError} from './client.mjs';

const fail=()=>{throw new EngineError('input_query','Invalid retained action context; no raw row returned.');};
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const stamp=v=>{if(typeof v!=='string'||!/^\d{1,24}$/.test(v))fail();return BigInt(v);};
const text=(v,max=256)=>{if(typeof v!=='string'||!v.trim()||Buffer.byteLength(v)>max||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v))fail();return v;};
const token=v=>typeof v==='string'&&/^act_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);

// Source snapshots only: never borrow a newer terminal action from a live store
// or turn a declared deadline into observed UI completion.
export function retainedActionContext(row,epoch,sourceRow,from,to) {
  const a=row.action;
  if(!obj(a)||a.schema!=='record-screen-action/v1'||a.clock_domain!=='CLOCK_UPTIME_RAW'||!token(a.action_token)||
    !['active','closed','expired','interrupted'].includes(a.state)||!['unknown','dispatched','delivered','verified','failed','interrupted'].includes(a.result))fail();
  const start=stamp(a.start_ns),deadline=stamp(a.deadline_ns),end=a.end_ns===null?null:stamp(a.end_ns);
  if(deadline<start||(end!==null&&(end<start||end>deadline))||(['closed','expired'].includes(a.state)&&end===null)||
    (a.state==='active'&&end!==null))fail();
  const update=(end??start)-epoch;
  if(typeof row.relative_ns!=='string'||!/^[-]?\d{1,24}$/.test(row.relative_ns)||BigInt(row.relative_ns)!==update)fail();
  const s=start-epoch,e=(end??deadline)-epoch;
  const overlaps=e===s?s>=from&&s<to:s<to&&e>from;
  const target=a.target;
  if(!obj(target))fail();
  const normalizedTarget={bundle_id:text(target.bundle_id)};
  for(const [k,max] of [['pid',2147483647],['window_id',4294967295]])if(target[k]!==undefined){if(!Number.isSafeInteger(target[k])||target[k]<1||target[k]>max)fail();normalizedTarget[k]=target[k];}
  const resolution=a.target_resolution===undefined?'legacy_unspecified':a.target_resolution;
  if(a.target_resolution!==undefined&&!['observed','declared'].includes(resolution))fail();
  if(resolution==='declared'&&(normalizedTarget.pid!==undefined||normalizedTarget.window_id!==undefined))fail();
  if(!obj(a.context))fail();
  const context={};for(const k of ['purpose','before_state','expected_change','verification_plan'])if(a.context[k]!==undefined)context[k]=text(a.context[k],1500);
  if(a.evidence_refs!==undefined&&(!Array.isArray(a.evidence_refs)||a.evidence_refs.length>16||a.evidence_refs.some(v=>typeof v!=='string'||!v.startsWith('/')||Buffer.byteLength(v)>2048||/[\x00-\x1f]/.test(v))))fail();
  return {overlaps,value:{source_row:sourceRow,action_token:a.action_token,action_id:text(a.action_id),session_id:text(a.session_id),
    caller:text(a.caller),provider:text(a.provider),intent:text(a.intent,3000),context,target:normalizedTarget,target_resolution:resolution,state:a.state,claimed_result:a.result,
    start_host_ns:String(start),end_host_ns:end===null?null:String(end),declared_deadline_host_ns:String(deadline),
    start_relative_ns:String(s),end_relative_ns:end===null?null:String(end-epoch),declared_deadline_relative_ns:String(deadline-epoch),
    update_relative_ns:String(update),update_time_qualification:'Source row uses end_ns when present, otherwise start_ns; not the annotation receipt time.',
    overlap_basis:end===null?'declared_deadline_only':'recorded_scope_bounds',end_kind:a.end_kind===undefined?null:text(a.end_kind),
    evidence_refs:a.evidence_refs?[...a.evidence_refs]:[],ownership:'unknown',verification:'unverified_claim',
    limits:['Captured action snapshot, not necessarily the final action state. Missing later update remains unknown.',
      'Scope bounds/deadlines do not prove actor ownership, provider delivery, visible changes or actual UI completion.',
      resolution==='declared'?'Declared target only: no observed identity or passive input attribution; no automatic binding.':'Target resolution does not establish input ownership.']}};
}
