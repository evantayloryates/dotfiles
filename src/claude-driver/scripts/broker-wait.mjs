#!/usr/bin/env node
// Resident-broker wait: the broker session runs this in its Bash tool and
// stays mid-turn while it blocks, so the app's CLI governor never counts it
// as idle and never evicts it. Bounded: exits after --max-sec (default 540,
// under the Bash tool's 10 min cap) and the broker simply runs it again.
//
// Prints exactly one line and exits 0:
//   REQUEST <json>   the oldest request with no result yet
//   IDLE             nothing arrived within the bound
//   STOP             <broker>/STOP exists (the driver asked it to end its turn)
// While waiting it writes <broker>/heartbeat.json every 2 s, which is how the
// driver knows the broker is resident and needs no wake message.

import { existsSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const flag = (n, d) => {
  const i = args.indexOf(`--${n}`)
  return i >= 0 ? args[i + 1] : d
}
const dir = flag('dir', process.env.CLAUDE_DRIVER_BROKER_DIR || join(process.env.HOME, '.local', 'state', 'claude-driver', 'broker'))
const maxSec = Number(flag('max-sec', 540))
const REQ = join(dir, 'requests')
const RES = join(dir, 'results')
const HB = join(dir, 'heartbeat.json')

function pending() {
  if (!existsSync(REQ)) return null
  const files = readdirSync(REQ)
    .filter((f) => f.endsWith('.json') && !existsSync(join(RES, f)))
    .map((f) => ({ f, m: statSync(join(REQ, f)).mtimeMs }))
    .sort((a, b) => a.m - b.m)
  for (const { f } of files) {
    try {
      const j = JSON.parse(readFileSync(join(REQ, f), 'utf8'))
      if (j?.id && Array.isArray(j.ops)) return j
    } catch {}
  }
  return null
}

function heartbeat(state) {
  const tmp = `${HB}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify({ pid: process.pid, ppid: process.ppid, at: Date.now(), state }))
  renameSync(tmp, HB)
}

const deadline = Date.now() + maxSec * 1000
let lastHb = 0
for (;;) {
  if (existsSync(join(dir, 'STOP'))) {
    heartbeat('stopped')
    console.log('STOP')
    break
  }
  const r = pending()
  if (r) {
    heartbeat('working')
    console.log(`REQUEST ${JSON.stringify({ id: r.id, ops: r.ops })}`)
    break
  }
  if (Date.now() > deadline) {
    heartbeat('rearming')
    console.log('IDLE')
    break
  }
  if (Date.now() - lastHb > 2000) {
    heartbeat('waiting')
    lastHb = Date.now()
  }
  await new Promise((res) => setTimeout(res, 200))
}
