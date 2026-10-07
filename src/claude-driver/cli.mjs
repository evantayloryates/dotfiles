#!/usr/bin/env node
// claude-driver CLI. Mirrors every MCP tool one to one, plus maintenance:
//
//   claude-driver <tool> [--arg value ...] [--json '{"arg": ...}']   any MCP tool, e.g.
//     claude-driver create_session --folder /abs/path --title "X" --model claude-opus-5-5
//     claude-driver pin_session --session "X" --pinned true
//   Inside a desktop session's shell, Tier B ops hand the ccd_* calls back to you; --broker forces the broker.
//   claude-driver tools                        list tools and their args
//   claude-driver preflight                    environment checks (+ probe if the app version changed)
//   claude-driver probe [--keep]               canary suite → capabilities.json
//   claude-driver broker init|status|revive    manage the broker session
//   claude-driver install [--dry-run]          register the MCP server in Claude Code, Codex, Cursor, OpenCode
//   claude-driver cleanup-leftovers <uuid>     remove CLI files for a deleted driver-created session

import { OPS, isDesktopCaller, runOp, txt } from './lib/driver.mjs'
import { DriverError } from './lib/paths.mjs'

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

// Coerce flag strings by the tool's schema.
function argsFor(op, flags) {
  const props = op.schema.properties || {}
  const out = flags.json ? JSON.parse(flags.json) : {}
  for (const [k0, v] of Object.entries(flags)) {
    if (k0 === 'json' || k0 === 'handback' || k0 === 'broker') continue
    const k = k0.replace(/-/g, '_')
    const t = props[k]?.type
    const types = Array.isArray(t) ? t : [t]
    if (v === 'null' && types.includes('null')) out[k] = null
    else if (types.includes('boolean')) out[k] = v === true || v === 'true'
    else if (types.includes('number')) out[k] = Number(v)
    else if (types.includes('array')) out[k] = String(v).split(',').map((s) => s.trim()).filter(Boolean)
    else out[k] = v
  }
  return out
}

async function main() {
  const { pos, flags } = parseArgs(process.argv.slice(2))
  const cmd = pos[0]
  if (!cmd || cmd === 'help' || cmd === '--help') {
    console.log((await import('node:fs')).readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 15).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'))
    return 0
  }
  if (cmd === 'tools') {
    for (const op of OPS) console.log(`${op.name}  ${Object.keys(op.schema.properties || {}).map((k) => ((op.schema.required || []).includes(k) ? `--${k}` : `[--${k}]`)).join(' ')}\n    ${op.description.slice(0, 160)}`)
    return 0
  }
  if (cmd === 'preflight') return (await import('./lib/probe.mjs')).preflight(flags)
  if (cmd === 'probe') return (await import('./lib/probe.mjs')).probe(flags)
  if (cmd === 'install') return (await import('./lib/install.mjs')).install(flags)
  if (cmd === 'cleanup-leftovers') {
    const { cleanupCliLeftovers } = await import('./lib/cleanup.mjs')
    console.log(txt(cleanupCliLeftovers(pos[1], { dryRun: !!flags['dry-run'] })))
    return 0
  }
  if (cmd === 'broker') {
    const b = await import('./lib/probe.mjs')
    return b.brokerCmd(pos[1] || 'status', flags)
  }
  const op = OPS.find((o) => o.name === cmd)
  if (!op) throw new DriverError(`unknown command ${cmd}; try \`claude-driver tools\``)
  // Run from a shell inside a desktop session, Tier B ops hand the ccd_* calls back to that session
  // (it has the tools; the broker may be asleep). --broker forces the broker; --handback forces handing back.
  const handback = flags.handback || (isDesktopCaller() && !flags.broker)
  const out = await runOp(cmd, argsFor(op, flags), { harness: handback ? 'cli-handback' : 'cli', progress: (m) => console.error(`[claude-driver] ${m}`) })
  console.log(txt(out))
  return 0
}

main()
  .then((code) => { process.exitCode = code ?? 0 })
  .catch((err) => {
    console.error(`claude-driver: ${err.category ? `[${err.category}] ` : ''}${err.message}`)
    process.exitCode = 1
  })
