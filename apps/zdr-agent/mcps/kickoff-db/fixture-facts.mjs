import { pinnedHelper } from './fixture-context.mjs'
const { getMealDay, daysBetween, terraDay, mergeLoggedMealMacros } = await pinnedHelper('fixture-facts.generated.mjs').catch(() => ({}))
export const fixtureFactsTool={name:'fixture_facts',title:'Compute pinned local-day and nutrition semantics',description:'Pure bounded computations using pinned Kickoff helpers: day_window excludes both partial boundary days and uses IANA zone/DST or UTC offset hours; terra_days preserves device-local day from metadata.start_time with referenceDate fallback; macro_merge preserves manual-vs-auto precedence and null nutrients. No database or caller code execution. All person-specific input/output stays inside ZDR.',inputSchema:{type:'object',required:['operation'],additionalProperties:false,properties:{operation:{type:'string',enum:['day_window','terra_days','macro_merge']},from:{type:'string'},to:{type:'string'},timeZone:{type:['string','null']},utcOffset:{type:['number','null']},rows:{type:'array',items:{type:'object'},maxItems:1000}}},annotations:{readOnlyHint:true,openWorldHint:false}}
export function fixtureFacts(args){
 if(typeof getMealDay !== 'function')throw new Error('fixture_context_missing')
 try{
  if(args.operation==='day_window'){
   if(typeof args.from!=='string'||typeof args.to!=='string'||!/Z$|[+-]\d\d:\d\d$/.test(args.from)||!/Z$|[+-]\d\d:\d\d$/.test(args.to))throw Error()
   const from=new Date(args.from),to=new Date(args.to)
   if(!Number.isFinite(+from)||!Number.isFinite(+to)||to<from||+to-+from>400*86400000||args.utcOffset!=null&&(!Number.isFinite(args.utcOffset)||Math.abs(args.utcOffset)>14))throw Error()
   const fromDay=getMealDay(from,args),toDay=getMealDay(to,args)
   return JSON.stringify({fromDay,toDay,wholeDays:fromDay<toDay?daysBetween(fromDay,toDay):[],partialBoundaryDaysExcluded:true})
  }
  if(!Array.isArray(args.rows)||args.rows.length>1000||args.rows.some(x=>!x||typeof x!=='object'||Array.isArray(x)))throw Error()
  if(args.operation==='terra_days')return JSON.stringify({days:args.rows.map(terraDay)})
  if(args.operation==='macro_merge')return JSON.stringify({macros:mergeLoggedMealMacros(args.rows)})
  throw Error()
 }catch{throw new Error('fixture_facts_arguments_invalid')}
}
