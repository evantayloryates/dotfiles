#!/usr/bin/env node
// Resident-broker wait: the broker session runs this in its Bash tool and
// stays mid-turn while it blocks. This does NOT itself prevent native app
// governor eviction: the app evicted a waiting broker after 133 s idle.
// Native session-cron protection is a separately qualified protocol concern.
// Bounded: exits after --max-sec (default 540,
// under the Bash tool's 10 min cap) and the broker simply runs it again.
//
// Prints exactly one line and exits 0:
//   REQUEST <json>   the oldest request with no result yet
//   IDLE             nothing arrived within the bound
//   STOP             <broker>/STOP exists (the driver asked it to end its turn)
// While waiting it writes <broker>/heartbeat.json every 2 s, which is how the
// driver knows the broker is resident and needs no wake message.

import { existsSync, renameSync, writeFileSync,fstatSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
// Set before importing state: test runners can use an isolated broker folder.

const args = process.argv.slice(2)
const flag = (n, d) => {
  const i = args.indexOf(`--${n}`)
  return i >= 0 ? args[i + 1] : d
}
const dir = flag('dir', process.env.CLAUDE_DRIVER_BROKER_DIR || join(process.env.HOME, '.local', 'state', 'claude-driver', 'broker'))
const maxSec = Number(flag('max-sec', 540))
// A native failure used `wait > /dev/null &` and silently stole a request.
// Enforce a caller-readable transport before any request/control access.
const output=fstatSync(1)
if(!output.isFIFO()&&!output.isSocket()&&!(output.isFile()&&output.uid===process.getuid())){
 console.error('waiter requires captured stdout (pipe, socket or owned regular file); no request claimed')
 process.exit(2)
}
if(!Number.isFinite(maxSec)||maxSec<0||maxSec>540){
 console.error('wait budget must be finite and between 0 and 540 seconds')
 process.exit(2)
}
process.env.CLAUDE_DRIVER_STATE_DIR = dirname(dir)
const { pickupPending } = await import('../lib/requests.mjs')
const { readJson,withLock } = await import('../lib/state.mjs')
const { getRecord, liveByHost } = await import('../lib/sessions.mjs')
const { brokerResidencyProtection } = await import('../lib/broker-residency.mjs')
const { waitDeadline } = await import('../lib/wait-budget.mjs')
const HB = join(dir, 'heartbeat.json')

function heartbeat(state) {
  const tmp = `${HB}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify({ pid: process.pid, ppid: process.ppid, at: Date.now(), state }))
  renameSync(tmp, HB)
}

// Observe the owned native journal once at entry, never every poll. A stream
// of requests can otherwise postpone IDLE forever and age out CronList proof.
const brokerId = readJson(join(dir, 'broker.json'), {}).sessionId
const record = brokerId && getRecord(brokerId)
const live = brokerId && liveByHost().get(brokerId)
const nativeOwned = record?.cwd && resolve(record.cwd) === resolve(dir) &&
 record.title === 'claude-driver-broker' && !record.isArchived &&
 record.permissionMode === 'bypassPermissions' && live?.entrypoint === 'claude-desktop'
const listedAt = nativeOwned ? brokerResidencyProtection(brokerId, live).listedAt : undefined
const deadline = waitDeadline({now:Date.now(), maxMs:maxSec * 1000, listedAt})
let lastHb = 0
// A second captured waiter must not compete with the foreground tool either.
// Kernel ownership spans the whole wait and the final request publication.
await withLock('broker-waiter',async()=>{
for (;;) {
  if (existsSync(join(dir, 'STOP'))) {
    heartbeat('stopped')
    console.log('STOP')
    break
  }
  // Maintenance wins over a still-pending request at its deadline. The request
  // remains unclaimed and can be served after the broker's native CronList.
  if (Date.now() >= deadline) {
    heartbeat('rearming')
    console.log('IDLE')
    break
  }
  const r = await pickupPending()
  if (r) {
    heartbeat('working')
    console.log(`REQUEST ${JSON.stringify({ id: r.id, ops: r.ops })}`)
    break
  }
  if (Date.now() - lastHb > 2000) {
    heartbeat('waiting')
    lastHb = Date.now()
  }
  await new Promise((res) => setTimeout(res, 200))
}
},{timeoutMs:500})
