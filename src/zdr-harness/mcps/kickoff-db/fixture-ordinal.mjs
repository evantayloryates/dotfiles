import { pinnedHelper } from './fixture-context.mjs'
const { computeCallNumber, groupSessions, targetForCall } = await pinnedHelper('fixture-call-number.generated.mjs').catch(() => ({}))
const date = value => {
 if(value == null)return null
 if(typeof value!=='string'||!/^\d{4}-\d\d-\d\d[T ]\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)?$/.test(value))throw new Error('fixture_ordinal_date_invalid')
 const d=new Date(value.replace(' ','T')+(/[Zz]|[+-]\d\d:\d\d$/.test(value)?'':'Z'))
 if(!Number.isFinite(+d))throw new Error('fixture_ordinal_date_invalid')
 return d
}
const id=x=>{const n=Number(x);if(x==null||!Number.isSafeInteger(n)||n<=0)throw new Error('fixture_ordinal_id_invalid');return n}
export function ordinalFromRows(rows,call,{coach_id,at}){
 if(typeof computeCallNumber !== 'function')throw new Error('fixture_context_missing')
 if(!Array.isArray(rows)||rows.length>10000)throw new Error('fixture_ordinal_history_limit')
 const normalized=rows.map(r=>({id:id(r.id),coachId:id(r.coachId),serviceId:r.serviceId==null?null:id(r.serviceId),startedAt:date(r.startedAt),scheduledAt:date(r.scheduledAt),completedAt:date(r.completedAt),durationMinutes:r.durationMinutes==null?null:Number(r.durationMinutes)}))
 if(normalized.some(r=>!r.completedAt||(r.durationMinutes!=null&&(!Number.isFinite(r.durationMinutes)||r.durationMinutes<0))))throw new Error('fixture_ordinal_row_invalid')
 const start=date(at)
 if(!start)throw new Error('fixture_ordinal_anchor_required')
 const target=call?targetForCall({id:id(call.id),coachId:id(call.coachId),serviceId:call.serviceId==null?null:id(call.serviceId),startedAt:date(call.startedAt),scheduledAt:date(call.scheduledAt),scheduledEndAt:date(call.scheduledEndAt)},start):{coachId:id(coach_id),start}
 const result=computeCallNumber(normalized,target)
 return {...result,priorCountedSessions:result.overall-1,qualifyingRows:rows.length,groupedSessions:groupSessions(normalized).length,asOf:start.toISOString(),exactPinnedHelper:true}
}
export const fixtureOrdinalTool={name:'fixture_call_number',title:'Compute exact pinned coaching session ordinals',description:'Harness-only production reader. Loads one client completed call history using the shipped loader filters (completed, not deleted/rescheduled/missed), then runs pinned computeCallNumber and targetForCall. Groups service/rejoins, sums duration before 8-minute floor, preserves overall/withCoach. At most 10000 rows; excess fails rather than truncating. Provide explicit UTC as-of; kickoff_call_id chooses target booking and verifies client ownership. Otherwise coach_id identifies unscheduled target. For transformed-history validation, provide rows (camelCase source fields) and optional call to compute without database access; IDs must be positive safe integers. No execution of caller code.',inputSchema:{type:'object',required:['at'],additionalProperties:false,properties:{rows:{type:'array',items:{type:'object'},maxItems:10000},call:{type:'object'},client_id:{type:'integer',minimum:1},coach_id:{type:'integer',minimum:1},kickoff_call_id:{type:'integer',minimum:1},at:{type:'string',description:'Explicit UTC ISO timestamp'}}},annotations:{readOnlyHint:true,openWorldHint:false}}
