// Bounded incremental transcript reads. A cursor belongs to one session and
// one CLI transcript; a /clear or rotation is reported, never silently mixed.
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { resolveSession, liveByHost } from './sessions.mjs'
import { DriverError, sleep } from './paths.mjs'

export function sessionEvents({ session, cursor, include_text = false, include_causality = false, limit = 30 }) {
  const r = resolveSession(session)
  let c
  if(cursor){try{c=JSON.parse(Buffer.from(cursor,'base64url').toString())}catch{throw new DriverError('invalid cursor',{category:'bad_args'})}}
  if(cursor&&(!c||typeof c!=='object'||Array.isArray(c)))throw new DriverError('invalid cursor',{category:'bad_args'})
  if(c&&c.session!==r.sessionId)throw new DriverError('cursor belongs to another session',{category:'cursor_reset'})
  const live = liveByHost().get(r.sessionId)
  const status = live?.status || (r.isArchived ? 'archived' : 'offline')
  const cli = r.cliSessionId || live?.sessionId
  const pending=()=>{
    if(c&&!c.pending)throw new DriverError('transcript disappeared; request a new cursor',{category:'cursor_reset'})
    if(c?.cli&&cli&&c.cli!==cli)throw new DriverError('pending transcript identity changed',{category:'cursor_reset'})
    const status=r.isArchived?'archived':'no_transcript'
    const next=cursor||Buffer.from(JSON.stringify({session:r.sessionId,pending:true,cli:cli||null,since:Date.now(),status})).toString('base64url')
    return {sessionId:r.sessionId,status,events:[],cursor:next,live:live?.status||null}
  }
  if (!cli) return pending()
  const file = join(process.env.CLAUDE_DRIVER_PROJECTS_DIR || join(homedir(), '.claude', 'projects'), r.cwd.replace(/[^A-Za-z0-9]/g, '-'), `${cli}.jsonl`)
  let fd
  try {fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK)}
  catch(error){if(error.code==='ENOENT')return pending();throw new DriverError('owned transcript could not be opened safely',{category:'cursor_reset'})}
  let st,identity,offset=0,previousStatus,bytes,buf
  try {
    st=fstatSync(fd)
    if(!st.isFile()||st.uid!==process.getuid())throw new DriverError('transcript is not an owned regular file',{category:'cursor_reset'})
    identity = `${cli}:${st.dev}:${st.ino}`
    if (cursor) {
      if(c.pending){
        if(c.cli&&c.cli!==cli||!Number.isSafeInteger(c.since)||c.since<0)throw new DriverError('invalid pending transcript cursor',{category:'cursor_reset'})
      }else {
        if(c.identity!==identity||!Number.isSafeInteger(c.offset)||c.offset<0||c.offset>st.size)throw new DriverError('cursor belongs to another session or a replaced transcript; request a new cursor',{category:'cursor_reset'})
        offset=c.offset
      }
      previousStatus=c.status
    }else offset=st.size // Observe only future events, never historical replies.
    bytes=Math.min(st.size-offset,256*1024);buf=Buffer.alloc(bytes)
    let count=0
    while(count<bytes){const n=readSync(fd,buf,count,bytes-count,offset+count);if(!n)throw new DriverError('transcript shortened during observation',{category:'cursor_reset'});count+=n}
    const after=fstatSync(fd)
    if(after.size<st.size||after.size===st.size&&(after.mtimeMs!==st.mtimeMs||after.ctimeMs!==st.ctimeMs))throw new DriverError('transcript changed during observation',{category:'cursor_reset'})
  }finally{closeSync(fd)}
  const events = []
  let consumed = 0
  for (const line of buf.toString('utf8').split('\n').slice(0, -1)) {
    const n = Buffer.byteLength(line) + 1
    let x
    try { x = JSON.parse(line) } catch { consumed += n; continue }
    if (!x || typeof x !== 'object') { consumed += n; continue }
    if(c?.since!==undefined&&(!Number.isSafeInteger(c.since)||!Number.isFinite(Date.parse(x.timestamp))||Date.parse(x.timestamp)<c.since)){consumed+=n;continue}
    const content = x.message?.content
    const blocks = Array.isArray(content) ? content : typeof content === 'string' ? [{ type: 'text', text: content }] : []
    const boundedId=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,200}$/.test(v)?v:undefined
    const at=typeof x.timestamp==='string'&&x.timestamp.length<=100&&Number.isFinite(Date.parse(x.timestamp))?x.timestamp:undefined
    // Native reminders and hook-result attachments can sit between the user
    // and assistant. Keep only their lineage, never attachment contents/types,
    // commands or stdout. Do not bridge system compaction/reset boundaries.
    if(include_causality&&x.type==='attachment'&&boundedId(x.uuid))events.push({id:boundedId(x.uuid),at,type:'metadata',sourceType:'attachment',parentId:boundedId(x.parentUuid)??null,sidechain:x.isSidechain===true})
    if (x.type === 'user' || x.type === 'assistant') {
      const text = blocks.filter(b=>b?.type === 'text' && typeof b.text === 'string').map(b=>b.text).join('\n')
      const tools = blocks.filter(b=>b?.type === 'tool_use' && typeof b.name === 'string').map(b=>b.name)
      // Never return thinking or tool inputs/results, even with include_text.
      const callBlocks=blocks.filter(b=>b?.type==='tool_use'),resultBlocks=blocks.filter(b=>b?.type==='tool_result')
      const toolCalls=callBlocks.slice(0,64).flatMap(b=>boundedId(b.id)&&typeof b.name==='string'&&/^[A-Za-z0-9_:.-]{1,200}$/.test(b.name)?[{id:b.id,name:b.name}]:[])
      const toolResults=resultBlocks.slice(0,64).flatMap(b=>boundedId(b.tool_use_id)?[{toolUseId:b.tool_use_id,isError:typeof b.is_error==='boolean'?b.is_error:null}]:[])
      const causal=include_causality&&boundedId(x.uuid)?{
        parentId:boundedId(x.parentUuid)??null,sidechain:x.isSidechain===true,
        ...(x.origin?.kind==='peer'&&boundedId(x.origin.msg_id)?{peerMessageId:x.origin.msg_id}:{}),
        ...(callBlocks.length?{toolCalls}:{}),
        ...(resultBlocks.length?{toolResults}:{}),
        ...(callBlocks.length>64||resultBlocks.length>64?{toolMetadataTruncated:true}:{}),
        ...(toolCalls.length!==Math.min(64,callBlocks.length)||toolResults.length!==Math.min(64,resultBlocks.length)?{toolMetadataIncomplete:true}:{})
      }:{}
      // Causal observation includes metadata-only ancestors (e.g. thinking
      // blocks). Their contents, user text and peer sender fields stay private.
      const stopReason=['end_turn','max_tokens','tool_use','pause_turn','refusal','stop_sequence','model_context_window_exceeded'].includes(x.message?.stop_reason)?x.message.stop_reason:undefined
      if (text || tools.length || include_causality&&boundedId(x.uuid)) events.push({ id: boundedId(x.uuid), at, type: x.type, stopReason, tools,...causal,
        ...(include_text && text && x.type === 'assistant' ? { text: text.slice(0, 4000),textTruncated:text.length>4000,textChars:text.length,...(text.length>4000?{textTail:text.slice(-256)}:{}) } : {}) })
    }
    consumed += n
    if (events.length >= limit) break
  }
  if (bytes === 256 * 1024 && consumed === 0) throw new DriverError('transcript record exceeds observation bound; use export_transcript for bulk content', { category: 'event_too_large' })
  const next = Buffer.from(JSON.stringify({ session: r.sessionId, identity, offset: offset + consumed, status, ...(c?.since!==undefined?{since:c.since}:{}) })).toString('base64url')
  return { sessionId: r.sessionId, status, statusChanged: previousStatus !== undefined && previousStatus !== status,
    ...(previousStatus !== undefined && previousStatus !== status ? { previousStatus } : {}),
    events, cursor: next, hasMore: offset + consumed < st.size, bytesRead: bytes }
}
export async function waitSession(args, { signal } = {}) {
  const deadline = Date.now() + (args.timeout_sec ?? 30) * 1000
  let cursor = args.cursor
  for (;;) {
    if (signal?.aborted) throw new DriverError('wait cancelled; session continues', { category: 'cancelled' })
    const out = sessionEvents({ ...args, cursor })
    cursor = out.cursor
    if (out.events.length || out.statusChanged || Date.now() >= deadline || out.status==='archived') return out
    await sleep(250)
  }
}
