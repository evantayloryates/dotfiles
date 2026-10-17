// Metadata preflight only. Receipt/epoch admission belongs to the native
// transaction layer; this function never authorizes archive or process control.
// rows are normalized metadata, not a parser for an unqualified native response.
export const NATIVE_FAMILY_QUERY=Object.freeze({include_archived:true,limit:100,linked:true})
const sessionId=x=>typeof x==='string'&&/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(x)
// Native 2.1.299 returned this exact success sentinel for an empty family.
// All other non-JSON text remains unresolved, including near matches/errors.
export function parseNativeFamilyMetadata(text,caller){
 if(typeof text!=='string'||Buffer.byteLength(text)>65536||!sessionId(caller))return null
 let rows
 if(text==='No other sessions found.')rows=[]
 else try{rows=JSON.parse(text)}catch{return null}
 if(!Array.isArray(rows)||rows.length>100)return null
 const seen=new Set()
 for(const row of rows){if(!row||typeof row!=='object'||Array.isArray(row)||!sessionId(row.sessionId)||row.sessionId===caller||seen.has(row.sessionId))return null;seen.add(row.sessionId)}
 return rows
}
export function reviewNativeFamilyPreflight({caller,query,rows,reviewedMembers}={}){
 const refuse=reason=>({qualified:false,reason,archiveAuthorized:false,physicalExitQualified:false})
 if(!sessionId(caller))return refuse('invalid-caller')
 if(!query||Object.keys(query).sort().join(',')!=='include_archived,limit,linked'||query.include_archived!==true||query.linked!==true||query.limit!==100)return refuse('query-scope')
 if(!Array.isArray(rows)||rows.length>=query.limit)return refuse('missing-or-truncated-family')
 if(!Array.isArray(reviewedMembers))return refuse('ownership-review-missing')
 const members=new Set()
 for(const row of rows){
  if(!row||typeof row!=='object'||Array.isArray(row)||!sessionId(row.sessionId)||row.sessionId===caller||members.has(row.sessionId))return refuse('invalid-family-row')
  members.add(row.sessionId)
 }
 const reviewed=new Set()
 for(const id of reviewedMembers){
  if(!sessionId(id)||reviewed.has(id)||!members.has(id))return refuse('invalid-ownership-review')
  reviewed.add(id)
 }
 if(reviewed.size!==members.size)return refuse('unreviewed-family-member')
 return {qualified:true,memberCount:members.size,members:[...members].sort(),callerExcluded:true,archiveAuthorized:false,physicalExitQualified:false}
}
