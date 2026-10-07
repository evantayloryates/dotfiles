// peerProtocol v1, spoken directly (no LLM hop, ~0.3 s). Reverse-engineered
// from Claude Code 2.1.284 on 2026-09-29; see docs/findings.md.
//
// One connection per message to the receiver's messagingSocketPath,
// newline-delimited JSON, then half-close; the receiver never writes back:
//   {"type":"auth","token":"<receiver's peerToken>"}
//   {"msgV":1,"msg_id":"<uuid>","type":"user","priority":"next","session_id":"<receiver cli session>",
//    "message":{"role":"user","content":"<cross-session-message from-name=… from-mode=…>\n…\n</cross-session-message>"}}
//
// The receiver accepts when the sender's from-mode class (bypass|prompting)
// matches its own permission-mode class and holds the message for approval
// otherwise. The driver claims the receiver's class: it is a machine sender
// whose requests the broker only ever runs from a fixed allowlist.

import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { closeSync, constants, fstatSync, lstatSync, openSync, readdirSync, readFileSync } from 'node:fs'
import { createConnection } from 'node:net'
import { join, resolve } from 'node:path'

import { DriverError, PEER_SESSIONS_DIR } from './paths.mjs'

const TAG = 'cross-session-message'
const LINE_CAP = 1048576
// CLI versions whose wire format this was verified against. Others fall back
// to the LLM sender in auto mode; explicit direct mode fails closed.
// 2.1.289: installed receiver functions exercised in isolation and exact
// owned native frame independently correlated by msg_id (155–156 ms).
// This qualifies transport acceptance, not model compliance/native controls.
export const VERIFIED_CLI = Object.freeze(['2.1.284','2.1.286','2.1.289'])

function procStartOf(pid) {
  try {
    return execFileSync('/bin/ps', ['-o', 'lstart=', '-p', String(pid)], { env: { LC_ALL: 'C', TZ: 'UTC', PATH: '/usr/bin:/bin' }, encoding: 'utf8', timeout: 2000 }).trim() || undefined
  } catch {
    return undefined
  }
}

export function peerRecord(hostSessionId,expectedPid) {
  const matches=[]
  let files;try{files=readdirSync(PEER_SESSIONS_DIR)}catch{return null}
  for (const f of files) {
    if (!/^\d+\.json$/.test(f)) continue
    let rec
    try {
      const file=join(PEER_SESSIONS_DIR,f)
      let fd
      try {
        fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK)
        const stat=fstatSync(fd)
        if(!stat.isFile()||stat.uid!==process.getuid()||stat.size>65536)continue
        const bytes=readFileSync(fd);if(bytes.length>65536)continue
        rec=JSON.parse(bytes.toString('utf8'))
      }finally{if(fd!==undefined)closeSync(fd)}
    } catch {
      continue
    }
    if (rec.hostSessionId !== hostSessionId || rec.pid !== Number(f.slice(0, -5))||rec.spare||rec.parkedJobId||typeof rec.procStart!=='string'||!rec.procStart) continue
    try {
      process.kill(rec.pid, 0)
    } catch {
      continue
    }
    if (procStartOf(rec.pid) !== rec.procStart) continue
    matches.push(rec)
  }
  // Do not choose a filesystem-order winner or silently route to a new PID.
  return matches.length===1&&(expectedPid===undefined||matches[0].pid===expectedPid)?matches[0]:null
}

export function canDeliver(target) {
  const rec = target?.sessionId && peerRecord(target.sessionId,target.live?.pid)
  if (!rec || rec.peerProtocol !== 1) return false
  return VERIFIED_CLI.includes(rec.version)
}

export function modeClass(permissionMode) {
  return permissionMode === 'bypassPermissions' ? 'bypass' : 'prompting'
}

function readToken(rec) {
  const hash = createHash('sha256').update(resolve(rec.messagingSocketPath)).digest('hex')
  const file = join(PEER_SESSIONS_DIR, `${rec.pid}.${hash}.key`)
  let fd
  try {
    fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK)
    const stat=fstatSync(fd)
    if(!stat.isFile()||stat.uid!==process.getuid()||stat.mode&0o077||stat.size>4096)throw Error('invalid key metadata')
    const key=JSON.parse(readFileSync(fd,'utf8')),t=key.peerToken
    if(typeof t!=='string'||!/^[0-9a-f]{32}$/.test(t)||key.procStart!==undefined&&key.procStart!==rec.procStart)throw Error('invalid key identity')
    return t
  }catch{throw new DriverError('owned peer authentication key is unavailable or invalid; no frame sent',{category:'peer_refused',detail:{dispatched:false,retrySafe:true}})}
  finally{if(fd!==undefined)closeSync(fd)}
}

function escapeBody(body) {
  if (/[^\x00-\x7f]/.test(body) && /cross.{0,3}session.{0,3}message/.test(body.normalize('NFKC').toLowerCase())) {
    throw new DriverError('message mixes non-ASCII text with the envelope tag name', { category: 'bad_args' })
  }
  return body.replace(/<(?!\\)(?=\s*\/\s*cross[-_\s]*session[-_\s]*message)/giu, '<\\')
}

function sendLines(sock, lines, {timeoutMs=5000,signal}={}) {
  return new Promise((ok, fail) => {
    if(signal?.aborted){fail(new DriverError('peer delivery cancelled',{category:'cancelled'}));return}
    const s = createConnection({ path: sock })
    let failed = false,written=false,halfClose
    const refuse=err=>{
      if(failed)return;failed=true
      err.detail={...err.detail,dispatched:written,retrySafe:!written}
      s.destroy();fail(err)
    }
    const abort=()=>refuse(new DriverError('peer delivery cancelled',{category:'cancelled'}))
    const timer=setTimeout(()=>refuse(new DriverError('peer delivery deadline exceeded',{category:'cli_timeout'})),timeoutMs)
    signal?.addEventListener('abort',abort,{once:true})
    if(signal?.aborted)abort()
    s.on('error', refuse)
    s.on('connect', () => {
      if(failed)return
      written=true
      s.write(lines)
      halfClose=setTimeout(() => !s.destroyed && s.end(), 150)
    })
    s.on('close', () => {clearTimeout(timer);clearTimeout(halfClose);signal?.removeEventListener('abort',abort);if(!failed)ok()})
  })
}

export function transcriptPath(rec) {
  return join(process.env.HOME, '.claude', 'projects', rec.cwd.replace(/[^A-Za-z0-9]/g, '-'), `${rec.sessionId}.jsonl`)
}

// target: { sessionId: local_…, permissionMode }. Returns { msgId, pid }.
export async function deliver(target, text, { fromName = 'claude-driver',timeoutMs=5000,signal,onPrepared } = {}) {
  if(signal?.aborted)throw new DriverError('peer delivery cancelled',{category:'cancelled'})
  if(typeof text!=='string'||typeof fromName!=='string'||/["<>\p{Cc}\p{Cf}]/u.test(fromName)||[...fromName].length>64||!Number.isFinite(timeoutMs)||timeoutMs<=0)
    throw new DriverError('invalid direct peer message or deadline',{category:'bad_args',detail:{dispatched:false,retrySafe:true}})
  const rec = peerRecord(target.sessionId,target.live?.pid)
  if (!rec) throw new DriverError(`no live process for ${target.sessionId}`, { category: 'broker_dead' })
  if(rec.peerProtocol!==1||!VERIFIED_CLI.includes(rec.version))throw new DriverError('direct transport is not qualified for this peer version',{category:'peer_unqualified',detail:{dispatched:false,retrySafe:true}})
  if(target.live?.procStart&&target.live.procStart!==rec.procStart)throw new DriverError('peer native process epoch changed',{category:'peer_refused',detail:{dispatched:false,retrySafe:true}})
  if(rec.sessionId!==target.sessionId.replace(/^local_/,''))throw new DriverError('peer CLI session identity mismatch',{category:'peer_refused'})
  const sock = rec.messagingSocketPath
  const lst = typeof sock === 'string' ? lstatSync(sock, { throwIfNoEntry: false }) : null
  if (!lst || lst.isSymbolicLink() || !lst.isSocket() || lst.uid !== process.getuid()) throw new DriverError(`bad peer socket ${sock}`, { category: 'peer_refused' })
  const fromMode = modeClass(target.permissionMode)
  const content = `<${TAG} from-name="${fromName}" from-mode="${fromMode}">\n${escapeBody(text)}\n</${TAG}>`
  const msgId = randomUUID()
  const frame = JSON.stringify({ msgV: 1, msg_id: msgId, type: 'user', message: { role: 'user', content }, priority: 'next', session_id: rec.sessionId })
  const token = readToken(rec)
  const payload = `${JSON.stringify({ type: 'auth', token })}\n${frame}\n`
  if (payload.length > LINE_CAP) throw new DriverError('message too large for one peer frame', { category: 'bad_args' })
  // Internal service callback sees metadata only, before a byte is sent.
  // A refused arm cannot fall through to another sender or race a fast Stop.
  if(onPrepared!==undefined){if(typeof onPrepared!=='function')throw new DriverError('invalid peer preparation callback',{category:'bad_args',detail:{dispatched:false,retrySafe:true}});await onPrepared({msgId,pid:rec.pid,procStart:rec.procStart})}
  await sendLines(sock, payload,{timeoutMs,signal})
  return { msgId, pid: rec.pid, procStart:rec.procStart, transcript: transcriptPath(rec) }
}

// Did the message land as a user turn? (Held/dropped messages never do.)
export function landedInTranscript(file, msgId) {
  try {
    return readFileSync(file, 'utf8').includes(msgId)
  } catch {
    return false
  }
}
