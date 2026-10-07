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
import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { createConnection } from 'node:net'
import { join, resolve } from 'node:path'

import { DriverError, PEER_SESSIONS_DIR } from './paths.mjs'

const TAG = 'cross-session-message'
const LINE_CAP = 1048576
// CLI versions whose wire format this was verified against. Others fall back
// to the LLM sender unless CLAUDE_DRIVER_PEER=direct.
export const VERIFIED_CLI = (process.env.CLAUDE_DRIVER_PEER_VERIFIED || '2.1.284,2.1.286').split(',')

function procStartOf(pid) {
  try {
    return execFileSync('/bin/ps', ['-o', 'lstart=', '-p', String(pid)], { env: { LC_ALL: 'C', TZ: 'UTC', PATH: '/usr/bin:/bin' }, encoding: 'utf8', timeout: 2000 }).trim() || undefined
  } catch {
    return undefined
  }
}

export function peerRecord(hostSessionId) {
  for (const f of readdirSync(PEER_SESSIONS_DIR)) {
    if (!/^\d+\.json$/.test(f)) continue
    let rec
    try {
      rec = JSON.parse(readFileSync(join(PEER_SESSIONS_DIR, f), 'utf8'))
    } catch {
      continue
    }
    if (rec.hostSessionId !== hostSessionId || rec.pid !== Number(f.slice(0, -5))) continue
    try {
      process.kill(rec.pid, 0)
    } catch {
      continue
    }
    if (rec.procStart !== undefined && procStartOf(rec.pid) !== rec.procStart) continue
    return rec
  }
  return null
}

export function canDeliver(target) {
  const rec = target?.sessionId && peerRecord(target.sessionId)
  if (!rec || rec.peerProtocol !== 1) return false
  return process.env.CLAUDE_DRIVER_PEER === 'direct' || VERIFIED_CLI.includes(rec.version)
}

export function modeClass(permissionMode) {
  return permissionMode === 'bypassPermissions' ? 'bypass' : 'prompting'
}

function readToken(rec) {
  const hash = createHash('sha256').update(resolve(rec.messagingSocketPath)).digest('hex')
  const file = join(PEER_SESSIONS_DIR, `${rec.pid}.${hash}.key`)
  if (!existsSync(file)) return undefined
  if (statSync(file).uid !== process.getuid()) throw new DriverError('peer key file is not owned by this user', { category: 'peer_refused' })
  const t = JSON.parse(readFileSync(file, 'utf8')).peerToken
  return typeof t === 'string' && /^[0-9a-f]{32}$/.test(t) ? t : undefined
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
export async function deliver(target, text, { fromName = 'claude-driver',timeoutMs=5000,signal } = {}) {
  if(signal?.aborted)throw new DriverError('peer delivery cancelled',{category:'cancelled'})
  const rec = peerRecord(target.sessionId)
  if (!rec) throw new DriverError(`no live process for ${target.sessionId}`, { category: 'broker_dead' })
  const sock = rec.messagingSocketPath
  const lst = typeof sock === 'string' ? lstatSync(sock, { throwIfNoEntry: false }) : null
  if (!lst || lst.isSymbolicLink() || !lst.isSocket() || lst.uid !== process.getuid()) throw new DriverError(`bad peer socket ${sock}`, { category: 'peer_refused' })
  const fromMode = modeClass(target.permissionMode)
  const content = `<${TAG} from-name="${fromName}" from-mode="${fromMode}">\n${escapeBody(text)}\n</${TAG}>`
  const msgId = randomUUID()
  const frame = JSON.stringify({ msgV: 1, msg_id: msgId, type: 'user', message: { role: 'user', content }, priority: 'next', session_id: rec.sessionId })
  const token = readToken(rec)
  const payload = `${token ? `${JSON.stringify({ type: 'auth', token })}\n` : ''}${frame}\n`
  if (payload.length > LINE_CAP) throw new DriverError('message too large for one peer frame', { category: 'bad_args' })
  await sendLines(sock, payload,{timeoutMs,signal})
  return { msgId, pid: rec.pid, transcript: transcriptPath(rec) }
}

// Did the message land as a user turn? (Held/dropped messages never do.)
export function landedInTranscript(file, msgId) {
  try {
    return readFileSync(file, 'utf8').includes(msgId)
  } catch {
    return false
  }
}
