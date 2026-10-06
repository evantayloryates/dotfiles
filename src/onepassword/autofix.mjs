// Durable, sanitized incident records. No broker operations or model calls.
import {mkdirSync,readFileSync,writeFileSync,renameSync,existsSync,realpathSync,statSync} from 'node:fs'
import {join,resolve,relative,sep} from 'node:path'
import {fileURLToPath} from 'node:url'
import {homedir} from 'node:os'
import {createHash} from 'node:crypto'
export const BASE=join(homedir(),'dotfiles/src/onepassword/autofixes')
export const PREFIX='⚙️ fix-1p-broker'
const months=['jan','feb','mar','apr','may','jun','jul','aug','sept','oct','nov','dec']
const format=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'numeric',day:'2-digit',hour:'numeric',minute:'2-digit',second:'2-digit',hourCycle:'h23'})
function parts(date){return Object.fromEntries(format.formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]))}
function slug(date,minutes=false){const p=parts(date);return `${months[p.month-1]}-${String(p.day).padStart(2,'0')}-${p.hour%12||12}${minutes?'.'+String(p.minute).padStart(2,'0'):''}${p.hour<12?'a':'p'}`}
export function candidates(date){
 const p=parts(date), list=[slug(date)]
 // Round the instant, then convert to Eastern again: DST gaps and date changes
 // use the real next hour, not an invented wall-clock hour.
 if(p.minute*60+p.second>1800)list.push(slug(new Date(date.getTime()+(3600-p.minute*60-p.second)*1000-date.getUTCMilliseconds())))
 list.push(slug(date,true))
 return [...new Set(list)]
}
export function read(path){return JSON.parse(readFileSync(path,'utf8'))}
export function write(path,value){const tmp=path+'.tmp';writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});renameSync(tmp,path)}
export function reserve({base=BASE,date=new Date(),episode=null,taken=[]}={}){
 mkdirSync(base,{recursive:true})
 for(const name of candidates(date)){
  if(taken.includes(PREFIX+'/'+name))continue
  const dir=join(base,name)
  try{mkdirSync(dir)}catch(e){if(e.code==='EEXIST')continue;throw e}
  mkdirSync(join(dir,'artifacts'))
  const incident={slug:name,title:PREFIX+'/'+name,createdAt:date.toISOString(),timeZone:'America/New_York',episode}
  write(join(dir,'incident.json'),incident)
  return {...incident,dir}
 }
 throw Error('Incident names occupied through the current minute; no report overwritten')
}
export function incidentAt(dir){return {...read(join(dir,'incident.json')),dir}}
export function settled(dir){return existsSync(join(dir,'settled.json'))}
function text(value,name){if(typeof value!=='string'||!value.trim())throw Error('Missing '+name);return value}
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
export function settle(dir,{base=BASE}={}){
 dir=realpathSync(dir);base=realpathSync(base)
 if(resolve(base,relative(base,dir))!==dir||relative(base,dir).split(sep).length!==1||relative(base,dir).startsWith('..'))throw Error('Incident must be directly inside autofixes')
 const incident=incidentAt(dir),r=read(join(dir,'report.json'))
 if(!['no_change','applied','staged'].includes(r.outcome))throw Error('Outcome must be no_change, applied or staged')
 for(const key of ['headline','summary','cause','resolution','verification','activation','limitations','docs'])text(r[key],key)
 if(r.docsReviewed!==true||r.verified!==true)throw Error('Verification and agent documentation review required')
 if(r.outcome==='staged'&&r.readyForNextLoad!==true)throw Error('Staged fix must be ready for its next service load')
 if(!Array.isArray(r.artifacts)||!r.artifacts.length)throw Error('Supporting evidence required')
 const evidence=r.artifacts.map(name=>{
  if(typeof name!=='string'||!name.startsWith('artifacts/'))throw Error('Artifact must be under artifacts/')
  const path=realpathSync(join(dir,name)),root=realpathSync(join(dir,'artifacts'))
  if(!path.startsWith(root+sep)||!statSync(path).isFile())throw Error('Artifact escapes incident')
  return {name,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')}
 })
 const fields=[['What happened',r.summary],['Cause',r.cause],['Resolution',r.resolution],['Verification',r.verification],['Service state and next load',r.activation],['Limits and remaining action',r.limitations],['Agent documentation',r.docs]]
 const links=evidence.map(a=>`<li><a href="${escape(a.name.split('/').map(encodeURIComponent).join('/'))}">${escape(a.name)}</a></li>`).join('')
 const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(r.headline)}</title><style>body{margin:0;background:#f4f3ef;color:#1d302e;font:17px/1.65 system-ui,sans-serif}main{max-width:920px;margin:auto;padding:60px 24px}header{border-top:5px solid #227567;padding:26px 0}small{letter-spacing:.1em;text-transform:uppercase;color:#496963}h1{font:600 clamp(30px,5vw,48px)/1.15 Georgia,serif;max-width:800px}h2{font-size:20px;margin:0 0 10px}p{white-space:pre-wrap;margin:0}section,details{background:white;border:1px solid #d8dfda;border-radius:12px;padding:26px;margin:20px 0}summary{cursor:pointer;font-weight:650}details section{padding:20px 0;border:0;border-top:1px solid #d8dfda;border-radius:0}a{color:#126557;overflow-wrap:anywhere}.status{display:inline-block;background:#dceee5;padding:4px 12px;border-radius:20px}footer{font-size:14px;color:#496963}@media print{main{padding:0}details{display:block}}</style><main><header><small>1Password broker · ${escape(incident.slug)} · Eastern time</small><h1>${escape(r.headline)}</h1><span class="status">${escape(r.outcome.replace('_',' '))}</span></header><section><h2>What happened</h2><p>${escape(r.summary)}</p></section><section><h2>What happens next</h2><p>${escape(r.activation)}</p></section><details open><summary>Technical evidence and agent handoff</summary>${fields.slice(1).filter(([k])=>k!=='Service state and next load').map(([k,v])=>`<section><h2>${escape(k)}</h2><p>${escape(v)}</p></section>`).join('')}<h2>Supporting artifacts</h2><ul>${links}</ul></details><footer>${escape(incident.title)} · ${escape(incident.createdAt)} · <a href="summary.md">Agent summary</a></footer></main></html>\n`
 writeFileSync(join(dir,'summary.html'),html)
 writeFileSync(join(dir,'summary.md'),`# ${incident.title}\n\n${r.headline}\n\nOutcome: ${r.outcome}. Created: ${incident.createdAt} (${incident.timeZone}).\n\n${fields.map(([k,v])=>`## ${k}\n\n${v}`).join('\n\n')}\n\n## Evidence\n\n${evidence.map(a=>`- ${a.name} (SHA-256 ${a.sha256})`).join('\n')}\n`)
 write(join(dir,'settled.json'),{outcome:r.outcome,settledAt:new Date().toISOString(),artifacts:evidence,reportSha256:createHash('sha256').update(readFileSync(join(dir,'report.json'))).digest('hex')})
 return {settled:true,dir,outcome:r.outcome}
}
try{if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv[2]!=='settle')throw Error('Usage: node autofix.mjs settle <incident-directory>')
 console.log(JSON.stringify(settle(process.argv[3])))
}}catch(e){console.error(e.message);process.exitCode=1}
