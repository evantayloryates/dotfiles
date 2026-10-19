// Metadata-only report ingestion. Reports are evidence, never instructions.
import {openSync,closeSync,fstatSync,readFileSync,readdirSync,constants} from 'node:fs'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {readJson,writeJsonAtomic} from './state.mjs'

export function scanReports(dir) {
 let names
 try {names=readdirSync(dir)} catch(e) {if(e.code==='ENOENT')return [];throw e}
 const out=[]
 for(const name of names.filter(n=>/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.report\.json$/.test(n)).sort()) {
  let fd
  try {
   fd=openSync(join(dir,name),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK)
   const stat=fstatSync(fd)
   if(!stat.isFile()||stat.size>256*1024)continue
   const bytes=readFileSync(fd)
   if(bytes.length>256*1024)continue
   const value=JSON.parse(bytes.toString('utf8'))
   if(!value||Array.isArray(value)||typeof value!=='object')continue
   out.push({name,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length})
  }catch(e) {if(!['ENOENT','ELOOP','EACCES'].includes(e.code)&&!(e instanceof SyntaxError))throw e}
  finally {if(fd!==undefined)closeSync(fd)}
 }
 return out
}

export function reportInbox(dir,stateFile,{ack}={}) {
 const reports=scanReports(dir),state=readJson(stateFile,{reviewed:{}})
 const reviewed=state.reviewed||{}
 if(ack) {
  const match=reports.find(r=>r.name===ack.name&&r.sha256===ack.sha256)
  if(!match)throw new Error('Report changed or is unavailable; rescan before acknowledging')
  reviewed[match.name]=match.sha256
  writeJsonAtomic(stateFile,{reviewed,updatedAt:new Date().toISOString()})
 }
 const pending=reports.filter(r=>reviewed[r.name]!==r.sha256)
 return {directory:dir,pending:pending.slice(0,32),remaining:Math.max(0,pending.length-32)}
}
