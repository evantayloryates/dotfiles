// Delivering a line of text into a live desktop session's process.
//
// peer-llm (proven 2026-09-29): a headless bundled CLI turn whose only tools
// are ListAgents + SendMessage. ~7 s with Haiku. The sender's permission
// mode must match the receiver's, or the receiver holds the message for
// approval.
//
// peer-direct (phase 2): speak peerProtocol v1 over the receiver's
// messagingSocketPath without an LLM hop. Used when peer-direct.mjs exists
// and the CLI version is one it was verified against; falls back to peer-llm.

import { DriverError, runCli } from './paths.mjs'
import { BROKER_DIR } from './state.mjs'

let direct = null
try {
  direct = await import('./peer-direct.mjs')
} catch {}

export async function deliver(target, text, { signal, timeoutMs=60000,onPrepared,priority='next', method = process.env.CLAUDE_DRIVER_PEER || 'auto' } = {}) {
  if(!target||typeof target.sessionId!=='string'||!/^local_[a-f0-9-]{36}$/.test(target.sessionId)||typeof text!=='string'||!Number.isFinite(timeoutMs)||timeoutMs<=0||!['auto','direct','llm'].includes(method)||!['next','now'].includes(priority)||priority==='now'&&method!=='direct')
    throw new DriverError('invalid peer target, text, method or deadline',{category:'bad_args',detail:{dispatched:false,retrySafe:true}})
  const deadline=Date.now()+timeoutMs
  if(signal?.aborted)throw new DriverError('peer delivery cancelled',{category:'cancelled'})
  if(method==='direct'&&!direct?.canDeliver?.(target))throw new DriverError('direct transport is not qualified for this live peer; no fallback sender started',{category:'peer_unqualified',detail:{dispatched:false,retrySafe:true}})
  if (method !== 'llm' && direct?.canDeliver?.(target)) {
    try {
      const r = await direct.deliver(target, text,{signal,onPrepared,priority,timeoutMs:Math.min(5000,Math.max(1,deadline-Date.now()))})
      return { method: 'peer-direct', ...r }
    } catch (err) {
      if (method === 'direct'||onPrepared||signal?.aborted||['cancelled','peer_refused','peer_unqualified','broker_dead','bad_args'].includes(err.category)||err.detail?.dispatched) throw err
    }
  }
  if(onPrepared)throw new DriverError('prepared peer wake requires qualified direct transport; no inference sender started',{category:'peer_unqualified',detail:{dispatched:false,retrySafe:true}})
  if(Date.now()>=deadline)throw new DriverError('peer delivery deadline exceeded',{category:'cli_timeout'})
  return deliverViaLlm(target, text, { signal,timeoutMs:Math.min(60000,deadline-Date.now()) })
}

async function deliverViaLlm(target, text, { signal,timeoutMs }) {
  const mode = target.permissionMode === 'bypassPermissions' ? 'bypassPermissions' : 'acceptEdits'
  const cli = target.sessionId.replace(/^local_/, '')
  const prompt =
    `Deliver one message to a peer Claude session, then stop. Use ListAgents to find the peer whose desktop session id is ${target.sessionId} ` +
    `(title "${target.title || ''}", pid ${target.live?.pid ?? 'unknown'}, cli session ${cli}). ` +
    `Then call SendMessage to it with this exact text and nothing else:\n${text}\n` +
    `After SendMessage returns, reply with exactly SENT, or FAILED: <reason> if you could not deliver it.`
  const r = await runCli(
    ['-p', prompt, '--model', 'claude-haiku-4-5-20251001', '--permission-mode', mode, '--allowedTools', 'ListAgents,SendMessage', '--strict-mcp-config'],
    { cwd: BROKER_DIR, timeoutMs, signal }
  )
  const out = `${r.stdout}`.trim()
  if (r.code !== 0 || !/\bSENT\b/.test(out)) {
    throw new DriverError(`peer delivery failed (exit ${r.code}): ${(out || r.stderr).slice(-400)}`, { category: 'peer_failed' })
  }
  return { method: 'peer-llm' }
}
