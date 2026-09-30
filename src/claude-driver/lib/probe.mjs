// preflight, probe (the canary suite behind capabilities.json) and the
// broker subcommands. The probe works only on throwaway sessions in
// <state>/probe/, cleans up by archiving, and queues them for a single
// batched delete card later (deletes always need Taylor).

import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { APP_SUPPORT, DESKTOP_CONFIG, MAIN_LOG, activeStore, appVersion, resolveClaudeBinary, cliVersionFromPath, versions } from './paths.mjs'
import { runOp, txt } from './driver.mjs'
import { BROKER_MODEL, BROKER_TITLE, brokerInfo, brokerRequest, prepareBrokerDir, protocolVersion, reviveBroker, saveBrokerInfo } from './broker.mjs'
import { CAPABILITIES, PROBE_DIR, STATE_DIR, readJson, updateRegistry, writeJsonAtomic } from './state.mjs'
import { currentMain, frontApp } from './focus.mjs'
import { getRecord, readGroups, waitForRecord } from './sessions.mjs'

const PROBE_MODEL = 'claude-haiku-4-5-20251001'

export async function preflight(flags = {}) {
  const lines = []
  const ok = (n, d) => lines.push(`PASS ${n}${d ? ` — ${d}` : ''}`)
  const bad = (n, d) => lines.push(`FAIL ${n}${d ? ` — ${d}` : ''}`)
  const warn = (n, d) => lines.push(`WARN ${n}${d ? ` — ${d}` : ''}`)
  try {
    const bin = resolveClaudeBinary()
    ok('bundled CLI', `${cliVersionFromPath(bin)} ${bin}`)
  } catch (err) {
    bad('bundled CLI', err.message)
  }
  appVersion() ? ok('app version', appVersion()) : bad('app version', 'cannot read /Applications/Claude.app Info.plist')
  try {
    const s = activeStore()
    ok('active session store', `${s.acct}/${s.org}`)
  } catch (err) {
    bad('active session store', err.message)
  }
  existsSync(DESKTOP_CONFIG) ? ok('desktop config readable', DESKTOP_CONFIG) : bad('desktop config', `${DESKTOP_CONFIG} missing`)
  existsSync(MAIN_LOG) ? ok('main.log', `focus source: ${JSON.stringify(currentMain())}`) : warn('main.log', 'missing; focus falls back to disk')
  ok('front app', await frontApp())
  const b = brokerInfo()
  if (!b.configured || !b.exists) bad('broker', 'not set up; run `claude-driver broker init`')
  else {
    ;(b.permissionMode === 'bypassPermissions' ? ok : warn)('broker', `${b.sessionId} mode ${b.permissionMode} title "${b.title}" (${b.titleSource}) ${b.live ? `live pid ${b.live.pid} ${b.live.status}` : 'asleep (revived on demand)'}`)
    if (!b.templateCurrent) warn('broker protocol', 'CLAUDE.md in the broker folder is older than the template; the next request refreshes it')
  }
  const { VERIFIED_CLI } = await import('./peer-direct.mjs')
  const v = versions()
  ;(VERIFIED_CLI.includes(v.cli) ? ok : warn)('peer-direct', VERIFIED_CLI.includes(v.cli) ? `verified for CLI ${v.cli}` : `CLI ${v.cli} not in verified list (${VERIFIED_CLI.join(', ')}); falls back to the LLM sender until re-verified`)
  existsSync(join(STATE_DIR, '..', 'codex-bridge')) || existsSync(new URL('../../codex-bridge/lib/bridge.mjs', import.meta.url)) ? ok('codex-bridge (Tier C)', 'present') : warn('codex-bridge', 'missing; Tier C unavailable')
  const caps = readJson(CAPABILITIES, {})
  const key = `${v.app}|${v.cli}`
  if (caps[key]) {
    const broken = Object.entries(caps[key].mechanisms).filter(([, m]) => !m.ok).map(([n]) => n)
    ;(broken.length ? warn : ok)('capability matrix', `${key} probed ${caps[key].probedAt}${broken.length ? `; broken: ${broken.join(', ')}` : '; all mechanisms ok'}`)
  } else if (flags['no-probe']) warn('capability matrix', `not probed for ${key}`)
  else {
    lines.push(`INFO capability matrix — not probed for ${key} (app or CLI changed); running probe`)
    console.log(lines.join('\n'))
    lines.length = 0
    await probe({})
  }
  console.log(lines.join('\n'))
  return lines.some((l) => l.startsWith('FAIL')) ? 1 : 0
}

export async function probe(flags = {}) {
  const v = versions()
  const key = `${v.app}|${v.cli}`
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dir = join(PROBE_DIR, stamp)
  mkdirSync(dir, { recursive: true })
  updateRegistry((r) => (r.folders[dir] = { createdAt: Date.now(), kind: 'probe' }))
  const mech = {}
  const log = (m) => console.error(`[probe] ${m}`)
  const step = async (name, fn) => {
    const t0 = Date.now()
    try {
      const detail = await fn()
      mech[name] = { ok: true, ms: Date.now() - t0, ...(detail !== undefined && { detail }) }
      log(`PASS ${name} (${Date.now() - t0} ms)`)
    } catch (err) {
      mech[name] = { ok: false, ms: Date.now() - t0, error: String(err.message).slice(0, 300), category: err.category }
      log(`FAIL ${name}: ${err.message.slice(0, 200)}`)
    }
    return mech[name].ok
  }
  const op = (name, args) => runOp(name, args, { harness: 'probe', progress: log })
  const title = `cd-probe ${stamp.slice(0, 16)}`
  let sid = null
  let forkId = null
  const before = currentMain().sessionId
  await step('create', async () => {
    const r = await op('create_session', { folder: dir, title, model: PROBE_MODEL })
    sid = r.sessionId
    if (!r.verified) throw new Error('not verified')
    return { focus: r.focus }
  })
  mech.focus_restore = { ok: currentMain().sessionId === before, detail: { before, after: currentMain().sessionId } }
  if (sid) {
    await step('broker_delivery', async () => {
      const r = await brokerRequest([{ op: 'get_session', args: { session_id: sid } }], { progress: log })
      return { via: r.deliveredVia, ms: r.ms }
    })
    await step('rename', async () => {
      const r = await op('rename_session', { session: sid, title: `${title} renamed` })
      if (r.titleSource !== 'tool') throw new Error(`titleSource ${r.titleSource}`)
    })
    await step('pin', () => op('pin_session', { session: sid, pinned: true }))
    await step('unpin', () => op('pin_session', { session: sid, pinned: false }))
    await step('group', async () => {
      const r = await op('manage_groups', { action: 'move', sessions: [sid], group: 'claude-driver' })
      if (!r.verified) throw new Error('group not verified')
    })
    await step('send_message', async () => {
      const r = await op('send_message', { session: sid, message: 'claude-driver probe: reply with exactly ok' })
      return r.delivery
    })
    // Let the probe turn finish, or archive refuses a working session.
    await new Promise((r) => setTimeout(r, 8000))
    await step('fork', async () => {
      const r = await op('fork_session', { session: sid, title: `${title} (fork)` })
      forkId = r.sessionId
    })
    await step('archive', () => op('archive_session', { session: sid }))
    await step('unarchive_link', async () => {
      const r = await op('unarchive_session', { session: sid })
      if (r.via !== 'deep link') throw new Error(`unarchived via ${r.via}`)
    })
    await step('cleanup_archive', async () => {
      for (const id of [sid, forkId].filter(Boolean)) {
        const rec = getRecord(id)
        if (rec && !rec.isArchived) await op('archive_session', { session: id })
      }
    })
    if (!flags.keep) await op('delete_sessions', { sessions: [sid, forkId].filter(Boolean), queue: true, reason: 'probe canary' })
  }
  const caps = readJson(CAPABILITIES, {})
  caps[key] = { probedAt: new Date().toISOString(), versions: v, mechanisms: mech }
  writeJsonAtomic(CAPABILITIES, caps)
  const failed = Object.entries(mech).filter(([, m]) => !m.ok)
  console.log(txt({ key, mechanisms: Object.fromEntries(Object.entries(mech).map(([k, m]) => [k, m.ok ? `ok ${m.ms ?? ''}ms` : `FAIL ${m.error || ''}`])) }))
  return failed.length ? 2 : 0
}

export async function brokerCmd(sub, flags = {}) {
  const log = (m) => console.error(`[broker] ${m}`)
  if (sub === 'status') {
    console.log(txt(brokerInfo()))
    return 0
  }
  if (sub === 'stop') {
    // Ends the resident loop's turn (the process then idles and may be evicted).
    const { writeFileSync } = await import('node:fs')
    const { BROKER_DIR } = await import('./state.mjs')
    writeFileSync(join(BROKER_DIR, 'STOP'), new Date().toISOString())
    console.log('STOP written; the broker ends its turn within ~1 s if resident. The next request clears it and wakes the broker.')
    return 0
  }
  if (sub === 'revive') {
    console.log(txt(await reviveBroker({ progress: log })))
    return 0
  }
  if (sub === 'init') {
    const cur = brokerInfo()
    if (cur.configured && cur.exists && !flags.force) {
      console.log(txt({ already: cur }))
      return 0
    }
    const folder = prepareBrokerDir()
    const r = await runOp('create_session', { folder, title: BROKER_TITLE, model: BROKER_MODEL, bootstrap_prompt: `Read CLAUDE.md in this folder. Reply with exactly: broker ready v${protocolVersion()}` }, { harness: 'cli', progress: log })
    saveBrokerInfo({ sessionId: r.sessionId, createdAt: new Date().toISOString() })
    log('created; waking it')
    await reviveBroker({ progress: log })
    await brokerRequest([{ op: 'set_session_title', args: { session_id: 'self', title: BROKER_TITLE } }], { progress: log })
    const g = readGroups().groups.find((x) => x.name === 'claude-driver')
    let groupId = g?.id
    if (!groupId) groupId = (await brokerRequest([{ op: 'create_group', args: { name: 'claude-driver' } }])).results[0].result?.id
    if (groupId) await brokerRequest([{ op: 'move_sessions', args: { session_ids: ['self'], group_id: groupId } }])
    saveBrokerInfo({ sessionId: r.sessionId, createdAt: new Date().toISOString(), groupId })
    log('asking the app to switch the broker to bypassPermissions: Taylor must approve the card shown in the broker session')
    await brokerRequest([{ op: 'set_session_permission_mode', args: { session_id: 'self', mode: 'bypassPermissions' } }], { timeoutMs: 600_000, progress: log }).catch((e) => log(`mode switch: ${e.message}`))
    const w = await waitForRecord(r.sessionId, (x) => x.permissionMode === 'bypassPermissions', { timeoutMs: 5000 })
    console.log(txt({ broker: brokerInfo(), bypass: w.ok }))
    return w.ok ? 0 : 2
  }
  throw new Error(`unknown broker command ${sub} (init|status|revive|stop)`)
}
