// Observe only the service's exact native session-local maintenance job.
// A model statement, unmatched result, failed create or durable job is not
// protection evidence. The app governor must acknowledge the same native ID.
import {homedir} from 'node:os'
import {join} from 'node:path'
import {execFileSync} from 'node:child_process'
import {getRecord} from './sessions.mjs'
import {tailFile,logSince} from './focus.mjs'
export const RESIDENCY_CRON='17 * * * *'
export const RESIDENCY_PROMPT='claude-driver drain v6'
const text=x=>typeof x==='string'?x:Array.isArray(x)?x.filter(b=>b?.type==='text').map(b=>b.text).join('\n'):''
export class CronProtection {
 constructor(){this.calls=new Map();this.jobs=new Map();this.listedAt=null;this.uncertain=false}
 feed(row){
  if(!['assistant','user'].includes(row?.type)||!Array.isArray(row.message?.content))return
  for(const b of row.message.content){
   if(b?.type==='tool_use'&&typeof b.id==='string'){
    if(b.name==='CronCreate'&&b.input?.cron===RESIDENCY_CRON&&b.input.prompt===RESIDENCY_PROMPT&&b.input.recurring===true&&b.input.durable!==true)
     this.calls.set(b.id,{name:b.name,at:row.timestamp})
    if(b.name==='CronList')this.calls.set(b.id,{name:b.name,at:row.timestamp})
    if(b.name==='CronDelete'&&this.jobs.has(b.input?.id))this.calls.set(b.id,{name:b.name,id:b.input.id,at:row.timestamp})
   }else if(b?.type==='tool_result'&&this.calls.has(b.tool_use_id)){
    const c=this.calls.get(b.tool_use_id);this.calls.delete(b.tool_use_id)
    if(b.is_error){this.uncertain=true;continue}
    const output=text(b.content)
    if(c.name==='CronCreate'){
     const id=output.match(/^Scheduled recurring job ([a-f0-9]{8})\b/)?.[1]
     if(id&&output.includes('Session-only (not written to disk'))this.jobs.set(id,{id,at:c.at,nativeToolUseId:b.tool_use_id})
     else this.uncertain=true
    }else if(c.name==='CronList'){
     if(output==='No scheduled jobs.'){this.jobs.clear();this.listedAt=c.at;this.uncertain=false;continue}
     const ids=output.split('\n').flatMap(line=>{
      const match=line.match(/^([a-f0-9]{8}) — Every hour at :17 \(recurring\) \[session-only\]: claude-driver drain v6$/)
      return match?[match[1]]:[]
     })
     if(!ids.length){this.uncertain=true;continue}
     this.jobs=new Map(ids.map(id=>[id,this.jobs.get(id)||{id,at:c.at,nativeToolUseId:b.tool_use_id}]))
     this.listedAt=c.at;this.uncertain=false
    }else if(c.name==='CronDelete'){
     if(output===`Cancelled job ${c.id}.`)this.jobs.delete(c.id)
     else this.uncertain=true
    }
   }
  }
 }
 snapshot(){return {jobs:[...this.jobs.values()],listedAt:this.listedAt,uncertain:this.uncertain}}
}
export function observeBrokerCron(brokerId,{since,now=Date.now()}={}){
 if(!Number.isFinite(since))return {verified:false,reason:'live-process-epoch-required'}
 const r=getRecord(brokerId)
 if(!r?.cwd||!r.cliSessionId)return {verified:false,reason:'no-native-journal'}
 const file=join(process.env.CLAUDE_DRIVER_PROJECTS_DIR||join(homedir(),'.claude','projects'),r.cwd.replace(/[^A-Za-z0-9]/g,'-'),r.cliSessionId+'.jsonl')
 const collector=new CronProtection()
 for(const line of tailFile(file,256*1024).split('\n')){
  let row;try{row=JSON.parse(line)}catch{continue}
  if(since!==undefined&&Date.parse(row.timestamp)<since)continue
  collector.feed(row)
 }
 const state=collector.snapshot(),fresh=state.listedAt&&now-Date.parse(state.listedAt)<12*60*1000&&Date.parse(state.listedAt)<=now
 const job=state.jobs.length===1?state.jobs[0]:null
 const acknowledged=job&&logSince(since??Date.parse(job.at),new RegExp(`\\[CCD\\] Session ${brokerId.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')} cron ${job.id} confirmed \\(active:`)).length>0
 return {verified:!!(fresh&&job&&acknowledged&&!state.uncertain),...state,appAcknowledged:!!acknowledged,
  reason:state.uncertain?'native-result-uncertain':!fresh?'native-list-not-fresh':!job?'expected-one-owned-job':!acknowledged?'app-acknowledgment-not-observed':'native-job-and-app-acknowledgment'}
}
export function brokerResidencyProtection(brokerId,live){
 if(!live)return {verified:false,reason:'broker-offline'}
 if(live.entrypoint!=='claude-desktop')return {verified:false,reason:'not-native-desktop'}
 let since
 try{since=Date.parse(execFileSync('/bin/ps',['-p',String(live.pid),'-o','lstart='],{encoding:'utf8',timeout:1500}).trim())}catch{}
 return observeBrokerCron(brokerId,{since})
}
