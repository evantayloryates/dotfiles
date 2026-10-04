#!/usr/bin/env node
// codex-bridge CLI: preflight, ad-hoc runs, daemon control. Same engine as the
// MCP server, so a task that works here works from Claude.
//
//   codex-bridge preflight
//   codex-bridge run "task" [--session NAME] [--apps Finder,Notes] [--new] [--allow-commands] [--screenshots none|last|all]
//   codex-bridge status [--session NAME]
//   codex-bridge approve <app> [--always] | revoke <app>
//   codex-bridge interrupt [--session NAME]
//   codex-bridge stop [--session NAME]      # HUMAN KILL SWITCH: interrupt every running Computer Use turn
//   codex-bridge close <session>            # archive a session's thread (frees its runtime on the daemon)
//   codex-bridge daemon start|stop|restart|status

import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { Bridge } from './lib/bridge.mjs'
import { CODEX_HOME, cliVersion, daemonRestart, daemonSocketPath, daemonStart, daemonStatus, daemonStop, resolveCodexBinary } from './lib/codex-paths.mjs'
import { loadPolicy } from './lib/policy.mjs'
import { STATE_DIR } from './lib/state.mjs'

const log = (...a) => console.error('[codex-bridge]', ...a)

function parseArgs(argv) {
  const pos = []
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = argv[i + 1]
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next
        i++
      } else flags[key] = true
    } else pos.push(a)
  }
  return { pos, flags }
}

async function preflight() {
  const checks = []
  const ok = (name, detail) => checks.push(`PASS ${name}${detail ? ` — ${detail}` : ''}`)
  const bad = (name, detail) => checks.push(`FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  let bin
  try {
    bin = resolveCodexBinary()
    ok('bundled codex binary', bin)
    ok('codex version', await cliVersion(bin))
  } catch (err) {
    bad('bundled codex binary', err.message)
  }
  const cuaApp = join(CODEX_HOME, 'computer-use', 'Codex Computer Use.app')
  existsSync(cuaApp) ? ok('Computer Use app', cuaApp) : bad('Computer Use app', `${cuaApp} missing; enable Computer Use in the Codex app`)
  const cuaNode = '/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai/cua-repl/bin/cua-repl.mjs'
  existsSync(cuaNode) ? ok('cua_repl runtime', cuaNode) : bad('cua_repl runtime', `${cuaNode} missing`)
  const pluginCache = join(CODEX_HOME, 'plugins', 'cache', 'openai-bundled', 'unified-computer-use')
  existsSync(pluginCache) ? ok('unified-computer-use plugin cache', pluginCache) : bad('unified-computer-use plugin cache', `${pluginCache} missing`)
  const policy = loadPolicy()
  ok('policy', `${policy.source || 'built-in defaults'} (unknown apps → ${policy.apps.unknown}, commands ${policy.commands}, sandbox ${policy.sandbox})`)
  const bridge = new Bridge({ log })
  try {
    await bridge.connect()
    ok('app-server connection', `${bridge.app.transportKind}, codex ${bridge.app.version}`)
    if (bin) {
      const d = await daemonStatus(bin).catch((err) => ({ status: `error: ${err.message}` }))
      ok('daemon', `${d.status}${d.appServerVersion ? ` v${d.appServerVersion}` : ''}${daemonSocketPath() ? ` socket ${daemonSocketPath()}` : ''}`)
    }
    const models = await bridge.app.modelList()
    const ids = (models?.data || []).map((m) => m.id || m.slug)
    ok('models available', ids.slice(0, 6).join(', ') + (ids.length > 6 ? ', …' : ''))
    const t = await bridge.app.threadStart({ cwd: process.cwd(), ephemeral: true, approvalPolicy: 'never', sandbox: 'read-only', serviceName: 'codex-bridge:preflight' })
    ok('thread/start (ephemeral)', `${t.thread.id} model ${t.model}`)
    const mcps = await bridge.app.request('mcpServerStatus/list', { threadId: t.thread.id }).catch(() => null)
    const cua = (mcps?.data || mcps?.servers || []).find((s) => s.name === 'cua_repl')
    cua ? ok('cua_repl MCP', `status ${cua.status || JSON.stringify(cua).slice(0, 80)}`) : ok('cua_repl MCP', 'status list unavailable; verified by run')
  } catch (err) {
    bad('app-server connection', err.message)
  } finally {
    bridge.close()
  }
  ok('state dir', STATE_DIR)
  console.log(checks.join('\n'))
  return checks.some((c) => c.startsWith('FAIL')) ? 1 : 0
}

async function main() {
  const { pos, flags } = parseArgs(process.argv.slice(2))
  const cmd = pos[0]
  const session = flags.session || 'default'
  if (!cmd || cmd === 'help') {
    console.log('codex-bridge stop [--session S]   (kill switch: interrupts every running turn)\ncodex-bridge close SESSION\ncodex-bridge preflight | run "task" [--session S --apps A,B --new --allow-commands --tolerate-app-changes --model M --screenshots none|last|all --timeout SEC] | status | approve APP [--always] | revoke APP | interrupt [--session S] | daemon start|stop|restart|status')
    return 0
  }
  if (cmd === 'preflight') return preflight()
  if (cmd === 'daemon') {
    const bin = resolveCodexBinary()
    const sub = pos[1] || 'status'
    const fn = { start: daemonStart, stop: daemonStop, restart: daemonRestart, status: daemonStatus }[sub]
    if (!fn) throw new Error(`unknown daemon command ${sub}`)
    console.log(JSON.stringify(await fn(bin), null, 2))
    return 0
  }
  const bridge = new Bridge({ log })
  try {
    if (cmd === 'run') {
      const task = pos.slice(1).join(' ')
      if (!task) throw new Error('run needs a task')
      const { result, text } = await bridge.run(
        {
          task,
          session,
          apps: flags.apps ? String(flags.apps).split(',').map((s) => s.trim()).filter(Boolean) : [],
          new_thread: !!flags.new,
          allow_commands: !!flags['allow-commands'],
          tolerate_app_changes: !!flags['tolerate-app-changes'],
          model: flags.model || undefined,
          timeout_sec: flags.timeout ? Number(flags.timeout) : undefined,
          screenshots: flags.screenshots || 'last',
        },
        { progress: (m) => log(m) }
      )
      console.log(text)
      return result.status === 'completed' ? 0 : 2
    }
    if (cmd === 'status') {
      console.log(await bridge.status({ session: flags.session }))
      return 0
    }
    if (cmd === 'approve') {
      console.log(bridge.approveApp(pos[1], flags.always ? 'always' : 'session'))
      return 0
    }
    if (cmd === 'revoke') {
      console.log(bridge.revokeApp(pos[1]))
      return 0
    }
    if (cmd === 'interrupt') {
      console.log(await bridge.interrupt(session))
      return 0
    }
    if (cmd === 'stop') {
      console.log(await bridge.stopAll({ session: flags.session || null }))
      return 0
    }
    if (cmd === 'close') {
      if (!pos[1]) throw new Error('close needs a session name')
      console.log(await bridge.closeSession(pos[1]))
      return 0
    }
    throw new Error(`unknown command ${cmd}`)
  } finally {
    bridge.close()
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`codex-bridge: ${err.message}`)
    process.exit(1)
  })
