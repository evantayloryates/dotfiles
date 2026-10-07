// Collect the broker's actual native tool output, never its LLM paraphrase.
// Only a successful dispatch checkpoint + identical native arguments can
// correlate a tool result. Thinking, unrelated calls and tool inputs stay private.
import {closeSync,existsSync,openSync,readSync,readFileSync,statSync} from 'node:fs'
import {homedir} from 'node:os'
import {join} from 'node:path'
import {getRecord} from './sessions.mjs'
import {DriverError} from './paths.mjs'
import {requestRescueReason} from '../scripts/broker-stop-rescue.mjs'
const table=readFileSync(new URL('../broker-template/CLAUDE.md',import.meta.url),'utf8')
const tools=Object.fromEntries([...table.matchAll(/^\| (\w+) \| (mcp__\w+) \|$/gm)].map(x=>[x[1],x[2]]))
const ordered=x=>Array.isArray(x)?x.map(ordered):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,ordered(x[k])])):x
const canonical=x=>JSON.stringify(ordered(x))
const text=x=>typeof x==='string'?x:Array.isArray(x)?x.filter(b=>b?.type==='text'&&typeof b.text==='string').map(b=>b.text).join('\n'):''
export class NativeReceipts {
  constructor(request){this.request=request;this.checks=new Map();this.calls=new Map();this.ready=new Set();this.results=new Map();this.wakes=new Map()}
  watchWake(msgId){if(typeof msgId==='string'&&this.wakes.size<3)this.wakes.set(msgId,{landed:false,chain:new Set(),toolCalls:0,terminalWithoutTools:false})}
  watchRescue(marker,epoch){
    const w=marker?.msgId&&this.wakes.get(marker.msgId)
    const createdAt=Date.parse(this.request.createdAt),expiresAt=this.request.expiresAt
    if(!w||!/^r[A-Za-z0-9_-]{1,99}$/.test(this.request.id)||!Number.isInteger(epoch?.pid)||epoch.pid<=0||typeof epoch.procStart!=='string'||!epoch.procStart.trim()||!Number.isFinite(createdAt)||!Number.isFinite(expiresAt)||expiresAt<=createdAt||marker.schemaVersion!==1||marker.requestId!==this.request.id||marker.attempts!==1||marker.pid!==epoch.pid||marker.procStart!==epoch.procStart||!Number.isFinite(marker.at)||marker.at<createdAt||marker.at>=expiresAt||marker.at>Date.now()||w.rescueConsumed)return
    if(![1,2].includes(marker.feedbackVersion??1))return
    w.rescueConsumed=true;w.rescueAt=marker.at;w.feedbackVersion=marker.feedbackVersion??1;w.terminalWithoutTools=false
  }
  wakeStatus(msgId){const w=this.wakes.get(msgId);return w?{landed:w.landed,toolCalls:w.toolCalls,terminalWithoutTools:w.terminalWithoutTools,nativeUserUuid:w.nativeUserUuid,nativeTerminalUuid:w.nativeTerminalUuid,rescueConsumed:!!w.rescueConsumed,rescueLanded:!!w.rescueLanded,terminalPhase:w.terminalPhase}:null}
  observeWake(row){
    if(row?.isSidechain||typeof row?.uuid!=='string')return
    const peerId=row.type==='user'&&row.origin?.kind==='peer'?row.origin.msg_id:null
    for(const [id,w] of this.wakes){
      if(peerId===id){w.landed=true;w.nativeUserUuid=row.uuid;w.chain.add(row.uuid);continue}
      if(!w.landed||!w.chain.has(row.parentUuid))continue
      // Another user turn is a new causal branch; tool results remain in ours.
      if(row.type==='user'&&(!Array.isArray(row.message?.content)||row.message.content.some(b=>b?.type!=='tool_result'))){
        // Native Stop feedback is a new user record, but only this exact fixed
        // service continuation, backed by exclusive per-ID/peer/epoch metadata,
        // belongs to our original causal branch. Human/other peer turns do not.
        if(!w.rescueConsumed||w.rescueLanded||row.isMeta!==true||row.origin?.kind==='peer'||typeof row.message?.content!=='string'||row.message.content!=='Stop hook feedback:\n'+requestRescueReason(this.request.id,w.feedbackVersion)||!Number.isFinite(Date.parse(row.timestamp))||Date.parse(row.timestamp)<w.rescueAt||Date.parse(row.timestamp)>Date.now())continue
        w.rescueLanded=true;w.terminalWithoutTools=false
      }
      if(w.chain.size>=1024){w.terminalWithoutTools=false;continue}
      w.chain.add(row.uuid)
      if(row.type==='assistant'){
        w.toolCalls+=(Array.isArray(row.message?.content)?row.message.content:[]).filter(b=>b?.type==='tool_use').length
        if(row.message?.stop_reason==='end_turn'){w.nativeTerminalUuid=row.uuid;w.terminalPhase=w.rescueLanded?'rescue':'wake';w.terminalWithoutTools=w.toolCalls===0&&(!w.rescueConsumed||w.rescueLanded)}
        if(w.toolCalls)w.terminalWithoutTools=false
      }
    }
  }
  feed(row){
    this.observeWake(row)
    if(!['assistant','user'].includes(row?.type)||!Array.isArray(row.message?.content))return
    for(const b of row.message.content){
      if(b?.type==='tool_use'&&typeof b.id==='string'){
        if(b.name==='Bash'){
          const command=b.input?.command
          if(typeof command==='string'){
            const indices=[]
            for(let i=0;i<this.request.ops.length;i++)
              if(command.includes(`broker-check.mjs ${this.request.id} ${i} --dir`))indices.push(i)
            if(indices.length)this.checks.set(b.id,indices)
          }
        }else for(const i of this.ready){
          const o=this.request.ops[i]
          if(b.name===tools[o.op]&&canonical(b.input)===canonical(o.args)){
            this.ready.delete(i);this.calls.set(b.id,i);break
          }
        }
      }else if(b?.type==='tool_result'){
        if(this.checks.has(b.tool_use_id)){
          const indices=this.checks.get(b.tool_use_id)
          this.checks.delete(b.tool_use_id)
          if(!b.is_error){
            const output=text(b.content)
            let checkpoints
            try{checkpoints=[JSON.parse(output)]}catch{checkpoints=output.split('\n').flatMap(line=>{try{return[JSON.parse(line)]}catch{return[]}})}
            for(const i of indices){const o=this.request.ops[i]
              if(checkpoints.some(c=>c?.dispatch===true&&c.op===o.op&&canonical(c.args)===canonical(o.args)))this.ready.add(i)
            }
          }
        }else if(this.calls.has(b.tool_use_id)){
          const i=this.calls.get(b.tool_use_id);this.calls.delete(b.tool_use_id)
          this.results.set(i,{op:this.request.ops[i].op,ok:!b.is_error,...(b.is_error?{error:text(b.content)}:{result:text(b.content)}),nativeToolUseId:b.tool_use_id})
        }
      }
    }
  }
  receipt(){return this.results.size===this.request.ops.length?{id:this.request.id,source:'native-tool-result',results:this.request.ops.map((_,i)=>this.results.get(i))}:null}
}
export function observeNativeReceipts(brokerId,request,start=null){
  const r=getRecord(brokerId),cli=start?.cliSessionId||r?.cliSessionId
  if(!r?.cwd||!cli)return null
  const file=join(process.env.CLAUDE_DRIVER_PROJECTS_DIR||join(homedir(),'.claude','projects'),r.cwd.replace(/[^A-Za-z0-9]/g,'-'),`${cli}.jsonl`)
  if(!existsSync(file))return null
  const stInitial=statSync(file)
  const initial=start?{dev:start.dev,ino:start.ino}:stInitial
  let offset=start?.offset??stInitial.size
  if(!Number.isSafeInteger(offset)||offset<0)throw new DriverError('invalid native receipt cursor',{category:'outcome_unknown'})
  const collector=new NativeReceipts(request)
  const observe=()=>{
    const st=statSync(file)
    if(st.dev!==initial.dev||st.ino!==initial.ino||st.size<offset)throw new DriverError('broker transcript changed before receipt; reconcile without replay',{category:'outcome_unknown',detail:{requestId:request.id}})
    const bytes=Math.min(st.size-offset,256*1024),buf=Buffer.alloc(bytes),fd=openSync(file,'r')
    try{readSync(fd,buf,0,bytes,offset)}finally{closeSync(fd)}
    const end=buf.lastIndexOf(10)
    if(end<0&&bytes===256*1024)throw new DriverError('broker transcript record exceeds receipt bound',{category:'outcome_unknown',detail:{requestId:request.id}})
    if(end>=0){for(const line of buf.subarray(0,end).toString('utf8').split('\n')){try{collector.feed(JSON.parse(line))}catch(e){if(e instanceof DriverError)throw e}}offset+=end+1}
    return collector.receipt()
  }
  observe.watchWake=id=>collector.watchWake(id)
  observe.watchRescue=(marker,epoch)=>collector.watchRescue(marker,epoch)
  observe.wakeStatus=id=>collector.wakeStatus(id)
  observe.start={brokerSessionId:brokerId,cliSessionId:cli,dev:initial.dev,ino:initial.ino,offset}
  return observe
}
