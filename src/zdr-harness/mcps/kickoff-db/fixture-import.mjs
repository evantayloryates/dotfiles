// Protected declarative structural import. No arbitrary code, paths or release.
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { protectedRead, fixturePackage } from './fixture-package.mjs'
const token=x=>typeof x==='string'&&/^[a-z][a-z0-9_]{0,63}$/i.test(x)
const fail=()=>{throw new Error('fixture_import_invalid')}
export function importSourcePages(args, sourceRoot, packageRoot) {
 try {
  if(!/^fp_[a-f0-9]{24}$/.test(args.package_id)||!token(args.table)||!token(args.route_field)||!Array.isArray(args.page_ids)||args.page_ids.length<1||args.page_ids.length>20||!Array.isArray(args.routes)||!args.routes.length||!args.fields||typeof args.fields!=='object'||Array.isArray(args.fields))fail()
  const routes=new Map()
  for(const r of args.routes){if((typeof r.source_value!=='string'&&!Number.isSafeInteger(r.source_value))||!token(r.bundle_id)||!Number.isInteger(r.date_shift_days)||Math.abs(r.date_shift_days)>36500||routes.has(String(r.source_value)))fail();routes.set(String(r.source_value),r)}
  const names=Object.keys(args.fields);if(!names.includes('id')||names.some(x=>!token(x)))fail()
  if(new Set(args.page_ids).size!==args.page_ids.length)fail()
  const omissions=args.omissions??{};if(!omissions||typeof omissions!=='object'||Array.isArray(omissions)||Object.entries(omissions).some(([field,reason])=>!token(field)||!['direct-identifier','provider-token','out-of-scope','unavailable-semantic','replaced'].includes(reason)))fail()
  const usedSources=new Set(Object.values(args.fields).filter(x=>x?.kind!=='constant').map(x=>x?.source))
  const omittedFields=new Set()
  const batches=[];let total=0
  // Validate every page and transform before any protected package writes.
  for(const page of args.page_ids){
   if(!/^sp_[a-f0-9]{24}$/.test(page))fail()
   const data=protectedRead(join(sourceRoot,page+'.json'));if(!Array.isArray(data.rows)||data.cellsTruncated!==false)fail()
   const groups=new Map()
   for(const row of data.rows){
    for(const field of Object.keys(row)){if(!usedSources.has(field)){if(!Object.hasOwn(omissions,field))throw new Error('fixture_import_omission_declaration_required');omittedFields.add(field)}}
    const route=routes.get(String(row[args.route_field]));if(!route)fail()
    const out={}
    for(const [dest,spec] of Object.entries(args.fields)){
     if(!spec||typeof spec!=='object'||Array.isArray(spec)||!['number','boolean','enum','id','datetime','constant','text'].includes(spec.kind))fail()
     let v=spec.kind==='constant'?spec.value:row[spec.source]
     if(spec.kind!=='constant'&&(!token(spec.source)||!Object.hasOwn(row,spec.source)))fail()
     if(v===null){if(spec.nullable!==true)fail();out[dest]=null;continue}
     if(spec.kind==='number'){if(typeof v!=='number'||!Number.isFinite(v))fail()}
     if(spec.kind==='boolean'){if(v!==true&&v!==false&&v!==0&&v!==1)fail();v=Boolean(v)}
     if(spec.kind==='enum'){if(!Array.isArray(spec.values)||!spec.values.includes(v))fail()}
     if(spec.kind==='id'){if(!token(spec.namespace)||(typeof v!=='string'&&!Number.isSafeInteger(v)))fail();v=spec.namespace+'_'+createHash('sha256').update(JSON.stringify([args.package_id,spec.namespace,v])).digest('hex').slice(0,24)}
     if(spec.kind==='datetime'){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z)?$/.test(v)||!Number.isFinite(Date.parse(v)))fail();const shifted=new Date(Date.parse(v)+route.date_shift_days*86400000).toISOString();v=v.length===10?shifted.slice(0,10):shifted}
     if(spec.kind==='text'){const replacement=spec.replacements?.[page]?.[String(row.id)];if(typeof replacement!=='string')throw new Error('fixture_import_text_replacement_required');v=replacement}
     if(spec.kind==='constant'&&(typeof v!=='string'&&typeof v!=='number'&&typeof v!=='boolean'))fail()
     out[dest]=v
    }
    if(!groups.has(route.bundle_id))groups.set(route.bundle_id,[]);groups.get(route.bundle_id).push(out);total++
   }
   for(const [bundle,rows] of groups){const digest=createHash('sha256').update(JSON.stringify([page,bundle,args.table,args.fields,args.routes])).digest('hex').slice(0,24);batches.push({action:'add_rows',package_id:args.package_id,bundle_id:bundle,table:args.table,chunk_id:'import_'+digest,rows})}
  }
  for(const batch of batches)fixturePackage(batch,packageRoot)
  return JSON.stringify({package_id:args.package_id,importedRows:total,chunks:batches.length,pages:args.page_ids.length,sensitive:true,released:false,privacyCertified:false,omissions:Object.fromEntries([...omittedFields].sort().map(x=>[x,omissions[x]])),limitations:['datetime rules accept UTC timestamps or date-only values; shifts do not establish privacy','ordinals must be computed on original source IDs before import','projected source columns require separate schema-level coverage accounting']})
 }catch(e){throw new Error(/^fixture_[a-z_]+$/.test(e.message)?e.message:'fixture_import_invalid')}
}
