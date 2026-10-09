// Retained observations, never a reconstructed missing-input interval or live
// permission state. Kept separate from event filters and source-row paging.
import {EngineError} from './client.mjs';
const fail=()=>{throw new EngineError('input_query','Invalid retained input-health metadata.');};
const text=v=>typeof v==='string'&&v.length>0&&Buffer.byteLength(v)<=128&&!/[\x00-\x1f]/.test(v)?v:fail();
const exact=(v,signed=false)=>typeof v==='string'&&(signed?/^-?[0-9]{1,24}$/:/^[0-9]{1,24}$/).test(v)?BigInt(v):fail();
const count=v=>v===undefined||v===null?null:Number.isSafeInteger(v)&&v>=0?v:fail();
export const INPUT_HEALTH_NOTIFICATION_LIMITS={preceding:16,in_interval:32,unknown_time:16};

export function inputHealthContext(from,to){
 const preceding=[],interval=[],unknown=[];
 let beforeCount=0,intervalCount=0,unknownCount=0,afterCount=0,protectedBefore=null,listenerBefore=null;
 const snapshots={protected:0,unprotected:0,unknown:0};
 const newer=(a,b)=>b===null||BigInt(a.relative_ns)>BigInt(b.relative_ns)||(a.relative_ns===b.relative_ns&&a.source_row>b.source_row);
 return {
  observeNotification(row,epoch,ordinal){
   if(!['input_gap','input_listener'].includes(row.kind))return;
   const raw=row.host_ns??row.received_host_ns;
   let relative=raw===undefined?null:exact(raw)-epoch;
   if(row.relative_ns!==undefined){const declared=exact(row.relative_ns,true);if(relative!==null&&declared!==relative)fail();relative=declared;}
   const n={source_row:ordinal,kind:row.kind,relative_ns:relative===null?null:String(relative)};
   if(row.kind==='input_gap'){n.reason=text(row.reason);n.events_skipped=count(row.events_skipped);}
   else n.state=text(row.state);
   if(relative===null){unknownCount++;if(unknown.length<16)unknown.push(n);return;}
   if(relative<from){
    beforeCount++;preceding.push(n);if(preceding.length>16)preceding.shift();
    if(n.kind==='input_listener'&&newer(n,listenerBefore))listenerBefore=n;
    if(n.kind==='input_gap'&&['secure_input_enabled','secure_input_ended'].includes(n.reason)&&newer(n,protectedBefore))protectedBefore=n;
   }else if(relative<to){intervalCount++;if(interval.length<32)interval.push(n);}
   else afterCount++;
  },
  observeEvent(event){
   const relative=BigInt(event.relative_ns);if(relative<from||relative>=to)return;
   snapshots[event.secure_input_snapshot===true?'protected':event.secure_input_snapshot===false?'unprotected':'unknown']++;
  },
  summary(){return {
   preceding_notifications:preceding,interval_notifications:interval,unknown_time_notifications:unknown,
   counts:{preceding:beforeCount,in_interval:intervalCount,unknown_time:unknownCount,after_interval:afterCount},
   truncated:{preceding:beforeCount>preceding.length,in_interval:intervalCount>interval.length,unknown_time:unknownCount>unknown.length},
   latest_timed_protection_notification_before_interval:protectedBefore,
   latest_timed_listener_notification_before_interval:listenerBefore,
   retained_event_protection_snapshots_in_interval:snapshots,
   selection:'Last16 preceding, first32 in-interval and first16 untimed notifications in source-row order. Latest timed preceding categories use exact reception offset then source-row tie; after-interval observations counted, not backfilled.',
   pagination:'Whole-interval health summary repeats across event pages and is independent of event-type/action filters. It is not a notification pagination cursor.',
   qualification:'Notifications and retained event snapshots are observations, not continuous state at interval start, live permission, exact missing-event intervals, full delivery or actor proof. Journal loss and unknown-time/truncated observations remain uncertainty.',
  };},
 };
}
