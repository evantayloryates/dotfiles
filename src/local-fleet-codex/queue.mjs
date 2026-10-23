// Durable, single-intent delivery to a Codex desktop chat through the local
// app-server queue. A queue receipt is not proof that the chat acted on it.
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { daemonSocketPath, daemonStart, resolveCodexBinary } from '../../mcps/codex-bridge/src/lib/codex-paths.mjs'
import { connectDaemonTransport } from '../../mcps/codex-bridge/src/lib/transport.mjs'
import { JsonRpcPeer } from '../../mcps/codex-bridge/src/lib/jsonrpc.mjs'

export const DEFAULT_STATE_DIR = join(homedir(), '.local', 'state', 'guidance-fleet-codex', 'delivery')
const sha = value => createHash('sha256').update(value).digest('hex')
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

function save(path, state) {
  const tmp = `${path}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 })
  renameSync(tmp, path)
}

export async function connectAppServer({ startIfAbsent = false } = {}) {
  let socket = daemonSocketPath()
  if (!socket && startIfAbsent) {
    await daemonStart(resolveCodexBinary())
    socket = daemonSocketPath()
  }
  if (!socket) throw new Error('Codex app-server daemon unavailable')
  const peer = new JsonRpcPeer(await connectDaemonTransport(socket))
  peer.on('request', request => request.fail(-32000, 'Fleet delivery cannot approve agent or authentication requests'))
  try {
    await peer.request('initialize', { clientInfo: { name: 'taylor-local-fleet-codex', version: '1' }, capabilities: { experimentalApi: true } }, { timeoutMs: 10000 })
    peer.notify('initialized')
    return peer
  } catch (error) { peer.close(); throw error }
}

function observed(turns, clientId) {
  return turns?.find(turn => turn.items?.some(item => item.type === 'userMessage' && item.clientId === clientId)) || null
}

async function inspect(call, threadId, clientId) {
  const [thread, queue] = await Promise.all([
    call('thread/read', { threadId, includeTurns: true }),
    call('thread/queue/list', { threadId }),
  ])
  return {
    thread,
    turn: observed(thread.thread?.turns, clientId),
    item: queue.data?.find(row => row.clientUserMessageId === clientId),
  }
}

export async function queueMessage({ threadId, key, message, stateDir = DEFAULT_STATE_DIR, peer, startIfIdle = true }) {
  if (!/^[0-9a-f-]{36}$/i.test(threadId)) throw new Error('exact Codex thread ID required')
  if (!key || typeof key !== 'string' || !message || typeof message !== 'string') throw new Error('key and message required')
  mkdirSync(stateDir, { recursive: true, mode: 0o700 })
  const path = join(stateDir, `${sha(key)}.json`)
  let state
  try { state = JSON.parse(readFileSync(path, 'utf8')) }
  catch (error) {
    if (error.code !== 'ENOENT') throw error
    state = { key, threadId, messageSha256: sha(message), clientId: randomUUID(), phase: 'prepared', createdAt: new Date().toISOString() }
    save(path, state)
  }
  if (state.key !== key || state.threadId !== threadId || state.messageSha256 !== sha(message)) throw new Error('delivery identity already bound to different intent')
  const previouslyConsumed = state.phase === 'consumed'

  const ownPeer = !peer
  if (!peer) peer = await connectAppServer({ startIfAbsent: true })
  const call = (method, params) => peer.request(method, params, { timeoutMs: 10000 })
  try {
    let { thread, turn, item } = await inspect(call, threadId, state.clientId)
    if (thread.thread?.isArchived || thread.thread?.archived) throw new Error('target chat is archived')
    if (!turn && !item && state.phase !== 'prepared') {
      for (let attempt = 0; attempt < 8 && !turn && !item; attempt += 1) {
        await pause(150)
        ;({ thread, turn, item } = await inspect(call, threadId, state.clientId))
      }
    }
    if (!turn && !item) {
      if (state.phase !== 'prepared') throw new Error(`prior ${state.phase} submission uncertain; reconcile original client ID without replay`)
      state.phase = 'submitting'; save(path, state)
      const result = await call('thread/queue/add', { threadId, clientUserMessageId: state.clientId, input: [{ type: 'text', text: message }] })
      state.queueId = result.queuedSubmission?.id
      state.phase = 'submitted'; save(path, state)
      for (let attempt = 0; attempt < 8 && !item && !turn; attempt += 1) {
        ;({ thread, turn, item } = await inspect(call, threadId, state.clientId))
        if (!item && !turn) await pause(150)
      }
      if (!item && !turn) throw new Error('queue submission not independently visible; no replay')
    }
    if (turn) {
      state.phase = 'consumed'; state.turnId = turn.id; save(path, state)
      return { phase: state.phase, threadId, clientId: state.clientId, turnId: turn.id, turnStatus: turn.status, newlyConsumed: !previouslyConsumed }
    }
    state.queueId = item.id; state.phase = 'queued'; save(path, state)
    if (!startIfIdle || !['idle', 'notLoaded'].includes(thread.thread?.status?.type)) {
      return { phase: state.phase, threadId, clientId: state.clientId, queueId: item.id }
    }
    if (thread.thread.status.type === 'notLoaded') {
      await call('thread/resume', { threadId })
    } else {
      try { await call('thread/queue/start', { threadId, queuedSubmissionId: item.id }) }
      catch (error) {
        // The desktop may consume it between the queue read and start. Give
        // readback time to settle, then fail closed if the outcome is unknown.
        let consumed = false
        for (let attempt = 0; attempt < 8; attempt += 1) {
          const latest = await call('thread/read', { threadId, includeTurns: true })
          if (observed(latest.thread?.turns, state.clientId)) { consumed = true; break }
          await pause(150)
        }
        if (!consumed) throw error
      }
    }
    for (let attempt = 0; attempt < 8; attempt += 1) {
      thread = await call('thread/read', { threadId, includeTurns: true })
      turn = observed(thread.thread?.turns, state.clientId)
      if (turn) {
        state.phase = 'consumed'; state.turnId = turn.id; save(path, state)
        return { phase: state.phase, threadId, clientId: state.clientId, turnId: turn.id, turnStatus: turn.status, newlyConsumed: !previouslyConsumed }
      }
      await pause(150)
    }
    return { phase: 'queued', threadId, clientId: state.clientId, queueId: item.id }
  } finally { if (ownPeer) peer.close() }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(resolve(process.argv[1]))) {
  const [threadId, key, messageFile] = process.argv.slice(2)
  if (!threadId || !key || !messageFile) {
    console.error('usage: node queue.mjs <thread-id> <stable-key> <message-file>')
    process.exitCode = 2
  } else {
    try { console.log(JSON.stringify(await queueMessage({ threadId, key, message: readFileSync(messageFile, 'utf8') }))) }
    catch (error) { console.error(JSON.stringify({ phase: 'uncertain', error: error.message })); process.exitCode = 1 }
  }
}
