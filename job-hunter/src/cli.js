import fs from 'node:fs/promises';
import { ingest } from './ingest.js';
import { validateStore } from './validation.js';
import { DATA_DIR, ROOT, dataPath } from './paths.js';
import { readJsonl, writeJsonl } from './store/jsonl-store.js';
import { acquireLock, inspectLock } from './store/lock.js';
import { nowIso, stableId } from './util.js';
import { jaccard } from './dedupe/fuzzy.js';
import { sourceConfig } from './sources/index.js';

const usage=()=>`Usage: job-hunter <command>
  ingest [--source NAME] [--dry-run] [--no-dashboard] [--gmail-batch N] [--max-per-source N]
  validate
  dashboard
  search <query>
  status <job-id> <status> [reason]
  sources
  doctor`;
const valueAfter=(args,flag)=>{const i=args.indexOf(flag);return i>=0?args[i+1]:null;};
const summary=(run)=>`${run.status}: ${run.totals.jobs_created} jobs created, ${run.totals.merged} merged, ${run.totals.postings_created} postings created, ${run.totals.ignored} unchanged, ${run.totals.errors} source errors${run.dry_run?' (dry run; no writes or Gmail mutations)':''}`;

async function statusCommand([jobId,toStatus,...reasonParts]) {
  const allowed=['new','reviewing','interested','applied','interviewing','offer','rejected_by_user','rejected_by_company','withdrawn','closed','archived'];
  if(!jobId||!allowed.includes(toStatus)){const error=new Error(`status requires a job id and one of: ${allowed.join(', ')}`);error.exitCode=2;throw error;}
  const release=await acquireLock(`status ${jobId} ${toStatus}`);
  try {const jobs=await readJsonl(dataPath('jobs.jsonl'));const job=jobs.find(j=>j.id===jobId);if(!job)throw new Error(`Unknown job ${jobId}`);const from=job.status,at=nowIso();job.status=toStatus;job.status_reason=reasonParts.join(' ')||null;job.updated_at=at;const events=await readJsonl(dataPath('status-events.jsonl'));events.push({schema_version:1,id:stableId('event',`${jobId}:${at}:${toStatus}`),job_id:jobId,from_status:from,to_status:toStatus,reason:job.status_reason,created_at:at});await writeJsonl(dataPath('jobs.jsonl'),jobs);await writeJsonl(dataPath('status-events.jsonl'),events);console.log(`${jobId}: ${from} → ${toStatus}`);} finally {await release();}
}
async function search(query){const jobs=await readJsonl(dataPath('jobs.jsonl'));const companies=new Map((await readJsonl(dataPath('companies.jsonl'))).map(c=>[c.id,c]));const postings=await readJsonl(dataPath('postings.jsonl'));const ranked=jobs.map(j=>({j,match:jaccard(query,`${j.title} ${j.description} ${j.fit.reasons.join(' ')}`)})).filter(x=>x.match>0).sort((a,b)=>b.match-a.match||b.j.fit.score-a.j.fit.score).slice(0,30);for(const {j} of ranked){const p=postings.find(x=>x.job_id===j.id);const salary=j.salary.base_max?`$${Math.round(j.salary.base_max/1000)}K max`:'salary unknown';console.log(`${j.id}\t${j.fit.score}\t${j.title}\t${companies.get(j.company_id)?.name||j.company_id}\t${salary}\t${p?.apply_url||p?.canonical_url||p?.source_url||''}`);}}
async function sources(){const cfg=await sourceConfig();for(const s of cfg.sources){const credential=s.source==='adzuna'?'ADZUNA_APP_ID + ADZUNA_APP_KEY':s.source==='theirstack'?'THEIRSTACK_API_KEY':s.source==='serpapi_google_jobs'?'SERPAPI_API_KEY':null;const ready=!credential||credential.split(' + ').every(k=>Boolean(process.env[k]));console.log(`${s.enabled?'enabled ':'disabled'} ${s.source} (${s.access_type})${credential?` — ${ready?'credential present':`missing ${credential}`}`:''}`);}}
async function doctor(){const checks=[];checks.push(['Node >= 20',Number(process.versions.node.split('.')[0])>=20,process.version]);checks.push(['project root',true,ROOT]);try{await fs.mkdir(DATA_DIR,{recursive:true});await fs.access(DATA_DIR,fs.constants.W_OK);checks.push(['data directory writable',true,DATA_DIR]);}catch(error){checks.push(['data directory writable',false,error.message]);}let gmail=null;try{await fs.access('/Users/taylor/dotfiles/gmail-mcp/run-gmail-mcp',fs.constants.X_OK);const {GmailMcpClient}=await import('./gmail/mcp-client.js');gmail=await new GmailMcpClient().connect();checks.push(['personal Gmail MCP tool contract',true,'search/read/modify/labels available']);}catch(error){checks.push(['personal Gmail MCP tool contract',false,error.message]);}finally{if(gmail)await gmail.close();}checks.push(['Cerebras dedupe',true,process.env.CEREBRAS_TOKEN?'credential present':'optional credential absent']);for(const [name,ok,detail] of checks)console.log(`${ok?'PASS':'FAIL'} ${name}: ${detail}`);const lock=await inspectLock();console.log(`${lock.active?'FAIL':'PASS'} writer lock: ${lock.exists?(lock.active?'active':'stale'):'clear'}`);await sources();return checks.some(x=>!x[1])||lock.active?1:0;}

export async function main(args){
  const [command,...rest]=args;if(!command||['-h','--help','help'].includes(command)){console.log(usage());return;}
  if(command==='ingest'){const selected=[];rest.forEach((x,i)=>{if(x==='--source'&&rest[i+1])selected.push(rest[i+1]);});const max=valueAfter(rest,'--max-per-source');const run=await ingest({sources:selected,dryRun:rest.includes('--dry-run'),noDashboard:rest.includes('--no-dashboard'),gmailBatch:Number(valueAfter(rest,'--gmail-batch')||10),maxPerSource:max?Number(max):null});console.log(summary(run));if(run.status!=='success')process.exitCode=1;return;}
  if(command==='validate'){const result=await validateStore();console.log(result.valid?`valid: ${Object.entries(result.counts).map(([k,v])=>`${k}=${v}`).join(', ')}`:result.errors.join('\n'));if(!result.valid)process.exitCode=1;return;}
  if(command==='dashboard'){const {buildDashboard}=await import('./dashboard/build.js');console.log(await buildDashboard());return;}
  if(command==='search'){if(!rest.length){const error=new Error('search requires a query');error.exitCode=2;throw error;}await search(rest.join(' '));return;}
  if(command==='status'){await statusCommand(rest);return;}if(command==='sources'){await sources();return;}if(command==='doctor'){process.exitCode=await doctor();return;}
  const error=new Error(`Unknown command ${command}\n${usage()}`);error.exitCode=2;throw error;
}
