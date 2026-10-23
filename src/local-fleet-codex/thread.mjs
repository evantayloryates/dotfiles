// Read-only Codex chat status for fleet managers whose native thread tools are
// unavailable. Output is deliberately bounded; board comments remain pickup proof.
import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { connectAppServer } from './queue.mjs'

export async function threadStatus(threadId, { peer } = {}) {
  if (!/^[0-9a-f-]{36}$/i.test(threadId || '')) throw new Error('exact Codex thread ID required')
  const own = !peer
  if (!peer) peer = await connectAppServer({ startIfAbsent: true })
  try {
    const result = await peer.request('thread/read', { threadId, includeTurns: true }, { timeoutMs: 10000 })
    const thread = result.thread
    const turn = thread.turns?.at(-1)
    return { id: thread.id, title: thread.name, status: thread.status,
      latestTurn: turn && { id: turn.id, status: turn.status,
        userClientIds: turn.items?.filter(item => item.type === 'userMessage').map(item => item.clientId).filter(Boolean),
      } }
  } finally { if (own) peer.close() }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(resolve(process.argv[1]))) {
  try { console.log(JSON.stringify(await threadStatus(process.argv[2]))) }
  catch (error) { console.error(error.message); process.exitCode = 1 }
}
