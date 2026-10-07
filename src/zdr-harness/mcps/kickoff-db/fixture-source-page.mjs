import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { protectedDirectory, protectedRead, protectedWrite } from './fixture-package.mjs'
export const fixtureSourceTool={name:'fixture_source_page',title:'Capture bounded full-fidelity source rows inside ZDR',description:'capture runs one read-only SELECT through the existing SQL guard, up to 50 rows and 2 MB. It saves rows only in protected ZDR exports and returns opaque page id/count/completeness. Never silently clips cells. read pages the saved JSON text (max 16000 chars); it is sensitive and must stay inside ZDR. Use scoped ordered SQL with keyset pagination and narrow columns; row cap indicates whether to continue. No arbitrary paths or export destination.',inputSchema:{type:'object',required:['action'],additionalProperties:false,properties:{action:{type:'string',enum:['capture','read']},sql:{type:'string'},limit:{type:'integer',minimum:1,maximum:50},page_id:{type:'string'},offset:{type:'integer',minimum:0},max_chars:{type:'integer',minimum:1,maximum:16000}}},annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false}}
export function storeSourcePage(rows,limit,root){
 if(!Array.isArray(rows)||!Number.isInteger(limit)||limit<1||limit>50||rows.length>limit+1)throw new Error('fixture_source_arguments_invalid')
 const containsBinary=x=>Buffer.isBuffer(x)||Array.isArray(x)&&x.some(containsBinary)||x&&typeof x==='object'&&Object.values(x).some(containsBinary)
 if(containsBinary(rows))throw new Error('fixture_source_binary_refused')
 const value={rows:rows.slice(0,limit),hasMore:rows.length>limit,cellsTruncated:false}
 if(Buffer.byteLength(JSON.stringify(value))>2_000_000)throw new Error('fixture_source_page_too_large_narrow_query')
 const page_id='sp_'+randomBytes(12).toString('hex')
 protectedWrite(join(protectedDirectory(root),page_id+'.json'),value)
 return JSON.stringify({page_id,rowCount:value.rows.length,hasMore:value.hasMore,cellsTruncated:false,sensitive:true})
}
export function readSourcePage({page_id,offset=0,max_chars=12000},root){
 if(!/^sp_[a-f0-9]{24}$/.test(page_id)||!Number.isInteger(offset)||offset<0||!Number.isInteger(max_chars)||max_chars<1||max_chars>16000)throw new Error('fixture_source_arguments_invalid')
 const data=protectedRead(join(protectedDirectory(root),page_id+'.json'))
 const text=JSON.stringify(data)
 return JSON.stringify({page_id,offset,totalChars:text.length,nextOffset:offset+max_chars<text.length?offset+max_chars:null,content:text.slice(offset,offset+max_chars),sensitive:true})
}
