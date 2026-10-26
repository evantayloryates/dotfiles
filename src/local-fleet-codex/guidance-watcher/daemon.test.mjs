import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const script = new URL('./daemon.sh', import.meta.url).pathname
const watcher = '01a16a1a-9aa8-7b52-8359-728ea0d63f90'
const manager = '01a169e7-316b-7581-9384-bff195cf157a'

test('terminal delivery holds exact event range until inspected cursor advances', () => {
  const home = mkdtempSync(join(tmpdir(), 'guidance-watcher-'))
  const state = join(home, '.local/state/guidance-fleet')
  const dir = join(state, 'kanban-watcher')
  const bin = join(home, 'bin')
  mkdirSync(dir, { recursive: true })
  mkdirSync(bin)
  writeFileSync(join(state, 'roles.tsv'), `watcher\t${watcher}\nmanager\t${manager}\n`)
  writeFileSync(join(dir, 'feed-state'), '9 11\n')
  writeFileSync(join(dir, 'codex-delivery.mjs'), `const key=process.argv[3]; if(key==='kw-ev-10-11'){console.error(JSON.stringify({phase:'terminal',turnId:'01a1768d-9b78-7a62-b30d-8d404c392bd8',turnStatus:'interrupted'}));process.exitCode=3}else console.log(JSON.stringify({phase:'consumed',turnStatus:'completed'}))`)
  for (const name of ['sweep.sh', 'stall.sh', 'codex-active.py']) writeFileSync(join(dir, name), name.endsWith('.py') ? '# empty\n' : '#!/bin/sh\n')
  for (const name of ['sweep.sh', 'stall.sh']) chmodSync(join(dir, name), 0o700)
  writeFileSync(join(bin, 'curl'), `#!/bin/sh\nread ack latest < "$HOME/.local/state/guidance-fleet/kanban-watcher/feed-state"\ncase "$*" in *'/api/consumers'*) printf '[{"name":"kanban-watcher","cursor":%s}]' "$ack";; *) printf '{"latest":%s}' "$latest";; esac\n`)
  writeFileSync(join(bin, 'osascript'), '#!/bin/sh\nexit 0\n')
  writeFileSync(join(bin, 'sleep'), '#!/bin/sh\n/bin/sleep 0.03\n')
  for (const name of ['curl', 'osascript', 'sleep']) chmodSync(join(bin, name), 0o700)
  const run = () => spawnSync('/bin/bash', [script], { env: { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}` }, timeout: 700, encoding: 'utf8' })
  try {
    run()
    let log = readFileSync(join(dir, 'daemon.log'), 'utf8')
    assert.equal((log.match(/CODEX TERMINAL \[kw-ev-10-11\]/g) || []).length, 1)
    assert.match(readFileSync(join(dir, 'daemon.state'), 'utf8'), /terminal_through=11/)
    assert.doesNotMatch(log, /queued for Codex \[kw-ev-12-/)
    writeFileSync(join(dir, 'feed-state'), '11 12\n')
    run()
    log = readFileSync(join(dir, 'daemon.log'), 'utf8')
    assert.match(log, /CODEX TERMINAL CLEARED: board cursor 11/)
    assert.match(log, /queued for Codex \[kw-ev-12-12\]/)
  } finally { rmSync(home, { recursive: true, force: true }) }
})

test('existing queued range is reconciled with its original key before newer events', () => {
  const home = mkdtempSync(join(tmpdir(), 'guidance-watcher-'))
  const state = join(home, '.local/state/guidance-fleet')
  const dir = join(state, 'kanban-watcher')
  const bin = join(home, 'bin')
  mkdirSync(dir, { recursive: true })
  mkdirSync(bin)
  writeFileSync(join(state, 'roles.tsv'), `watcher\t${watcher}\nmanager\t${manager}\n`)
  writeFileSync(join(dir, 'daemon.state'), 'last_prompted=11\nprompted_from=10\nprompted_at=0\nreprompted=0\nsweep_sig=\nsweep_at=0\nterminal_through=0\nterminal_turn=\n')
  writeFileSync(join(dir, 'codex-delivery.mjs'), `const key=process.argv[3]; if(key==='kw-ev-10-11'){console.error(JSON.stringify({phase:'terminal',turnId:'01a1768d-9b78-7a62-b30d-8d404c392bd8',turnStatus:'interrupted'}));process.exitCode=3}else console.log(JSON.stringify({phase:'consumed',turnStatus:'completed'}))`)
  for (const name of ['sweep.sh', 'stall.sh', 'codex-active.py']) writeFileSync(join(dir, name), name.endsWith('.py') ? '# empty\n' : '#!/bin/sh\n')
  for (const name of ['sweep.sh', 'stall.sh']) chmodSync(join(dir, name), 0o700)
  writeFileSync(join(bin, 'curl'), '#!/bin/sh\ncase "$*" in *\'/api/consumers\'*) printf \'[{"name":"kanban-watcher","cursor":9}]\';; *) printf \'{"latest":12}\';; esac\n')
  writeFileSync(join(bin, 'osascript'), '#!/bin/sh\nexit 0\n')
  writeFileSync(join(bin, 'sleep'), '#!/bin/sh\n/bin/sleep 0.03\n')
  for (const name of ['curl', 'osascript', 'sleep']) chmodSync(join(bin, name), 0o700)
  try {
    spawnSync('/bin/bash', [script], { env: { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}` }, timeout: 700, encoding: 'utf8' })
    const log = readFileSync(join(dir, 'daemon.log'), 'utf8')
    assert.equal((log.match(/CODEX TERMINAL \[kw-ev-10-11\]/g) || []).length, 1)
    assert.doesNotMatch(log, /kw-ev-12-12/)
    assert.match(readFileSync(join(dir, 'daemon.state'), 'utf8'), /terminal_through=11/)
  } finally { rmSync(home, { recursive: true, force: true }) }
})
