// Tier A: deterministic, no LLM in the loop beyond the bootstrap turn, works
// from any process. Headless bundled CLI + claude:// deep links + disk reads.

import { randomUUID } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'

import { DriverError, MAIN_LOG, makeScratchFolder, openUrl, runCli, sh } from './paths.mjs'
import { getRecord, resolveSession, waitForRecord } from './sessions.mjs'
import { sessionUrl } from './focus.mjs'
import { updateRegistry } from './state.mjs'
import { cleanupCliLeftovers } from './cleanup.mjs'

export const DEFAULT_MODEL = process.env.CLAUDE_DRIVER_DEFAULT_MODEL || 'claude-opus-5-5'
export const DEFAULT_BOOTSTRAP = 'This session was created by claude-driver. Reply with exactly: ready'

async function importLink(uuid) {
  await openUrl(`claude://resume?session=${uuid}`)
}

async function mainLogTail(uuid) {
  try {
    return (await sh('/usr/bin/tail', ['-n', '400', MAIN_LOG]))
      .split('\n')
      .filter((l) => l.includes(uuid))
      .slice(-5)
      .join('\n')
  } catch {
    return ''
  }
}

async function bootstrap(args, cwd, signal, uuid) {
  const r = await runCli(args, { cwd, signal })
  if (r.code !== 0) {
    // A failed bootstrap still writes a transcript, session-env and security state.
    try {
      cleanupCliLeftovers(uuid, { force: true })
    } catch {}
    const tail = `${r.stderr}\n${r.stdout}`.trim().slice(-800)
    const category = /401|auth|login/i.test(tail) ? 'cli_auth' : /model/i.test(tail) ? 'cli_model' : 'cli_failed'
    throw new DriverError(`bootstrap turn failed (exit ${r.code}): ${tail}`, { category })
  }
  return r
}

// create_session({ folder | no_project, title, model?, effort?, bootstrap_prompt? })
export async function createSession({ folder, no_project, title, model, effort, bootstrap_prompt, permission_mode }, { signal } = {}) {
  if (!title || typeof title !== 'string') throw new DriverError('title is required', { category: 'bad_args' })
  if (!folder && !no_project) throw new DriverError('pass folder (absolute path) or no_project: true', { category: 'bad_args' })
  let cwd
  let createdFolder = false
  if (no_project) {
    cwd = makeScratchFolder()
    createdFolder = true
  } else {
    if (!isAbsolute(folder)) throw new DriverError(`folder must be absolute: ${folder}`, { category: 'bad_args' })
    cwd = resolve(folder)
    if (!existsSync(cwd) || !statSync(cwd).isDirectory()) throw new DriverError(`folder does not exist: ${cwd}`, { category: 'bad_args' })
  }
  const uuid = randomUUID()
  const localId = `local_${uuid}`
  const m = model || DEFAULT_MODEL
  const args = ['-p', bootstrap_prompt || DEFAULT_BOOTSTRAP, '--session-id', uuid, '-n', title, '--model', m, '--strict-mcp-config']
  if (effort) args.push('--effort', effort)
  // The app clamps an imported bypass to acceptEdits; every other mode survives the import.
  if (permission_mode && permission_mode !== 'bypassPermissions') args.push('--permission-mode', permission_mode)
  const t0 = Date.now()
  await bootstrap(args, cwd, signal, uuid)
  const bootMs = Date.now() - t0
  updateRegistry((reg) => {
    reg.sessions[localId] = { createdAt: Date.now(), cwd, title, kind: 'create' }
    if (createdFolder) reg.folders[cwd] = { createdAt: Date.now(), kind: 'scratch', session: localId }
  })
  await importLink(uuid)
  const w = await waitForRecord(localId, (r) => r.title === title && r.cwd === cwd)
  if (!w.ok) {
    const log = await mainLogTail(uuid)
    throw new DriverError(`imported record did not verify within 20 s (record: ${w.record ? JSON.stringify({ title: w.record.title, cwd: w.record.cwd }) : 'missing'})${log ? `\nmain.log:\n${log}` : ''}`, {
      category: w.record ? 'verify_mismatch' : 'import_missing',
    })
  }
  return { sessionId: localId, cliSessionId: uuid, cwd, title, model: w.record.model, permissionMode: w.record.permissionMode, titleSource: w.record.titleSource, bootMs, navigatedTo: localId, verified: true }
}

// fork_session({ session, title? })
export async function forkSession({ session, title, bootstrap_prompt }, { signal } = {}) {
  const src = resolveSession(session)
  const cli = src.cliSessionId || src.sessionId.replace(/^local_/, '')
  const cwd = src.cwd
  if (!cwd || !existsSync(cwd)) throw new DriverError(`source cwd is gone: ${cwd}`, { category: 'bad_state' })
  const uuid = randomUUID()
  const localId = `local_${uuid}`
  const t = title || `${src.title || 'Untitled'} (fork)`
  const args = ['-p', bootstrap_prompt || 'This is a fork created by claude-driver. Reply with exactly: forked', '--resume', cli, '--fork-session', '--session-id', uuid, '-n', t, '--strict-mcp-config']
  if (src.model) args.push('--model', src.model)
  await bootstrap(args, cwd, signal, uuid)
  updateRegistry((reg) => {
    reg.sessions[localId] = { createdAt: Date.now(), cwd, title: t, kind: 'fork', from: src.sessionId }
  })
  await importLink(uuid)
  const w = await waitForRecord(localId, (r) => r.title === t)
  if (!w.ok) throw new DriverError(`fork import did not verify within 20 s${(await mainLogTail(uuid)) ? `\n${await mainLogTail(uuid)}` : ''}`, { category: 'import_missing' })
  return { sessionId: localId, cliSessionId: uuid, forkedFrom: src.sessionId, cwd, title: t, navigatedTo: localId, verified: true }
}

// Unarchive by re-importing: proven for imported sessions (cli id == local
// uuid). Returns { ok:false } when the record stays archived so the caller
// can fall back to Tier B.
export async function unarchiveViaLink(rec) {
  const cli = rec.cliSessionId || rec.sessionId.replace(/^local_/, '')
  await importLink(cli)
  const w = await waitForRecord(rec.sessionId, (r) => r.isArchived === false, { timeoutMs: 6000 })
  return { ok: w.ok, navigatedTo: rec.sessionId }
}

export async function openSession(rec) {
  await openUrl(sessionUrl(rec.sessionId))
  return { sessionId: rec.sessionId, title: rec.title, navigatedTo: rec.sessionId }
}

export { getRecord }
