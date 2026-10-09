#!/usr/bin/env node
// Passive bounded process/pressure samples. Optional guard stops only supplied
// recording IDs after checking their explicit session; never restarts/kills peers.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, openSync, writeSync, closeSync } from 'node:fs'
import { join } from 'node:path'
import { call } from '../lib/client.mjs'

const [configPath, output] = process.argv.slice(2)
if (!configPath || !output) throw new Error('Usage: sample-resources.mjs CONFIG.json FRESH_OUTPUT_DIRECTORY')
const config = JSON.parse(readFileSync(configPath, 'utf8'))
const keys = ['pids', 'seconds', 'interval_ms', 'pressure_path', 'guard_session_id', 'guard_recording_ids']
if (!config || Array.isArray(config) || Object.keys(config).some(k => !keys.includes(k)) ||
    !Array.isArray(config.pids) || config.pids.length < 1 || config.pids.length > 16 ||
    config.pids.some(p => !Number.isInteger(p) || p < 1 || p > 2147483647) ||
    !Number.isFinite(config.seconds) || config.seconds < 1 || config.seconds > 3600 ||
    !Number.isInteger(config.interval_ms ?? 1000) || (config.interval_ms ?? 1000) < 500 || (config.interval_ms ?? 1000) > 10000 ||
    typeof config.pressure_path !== 'string' || !config.pressure_path.startsWith('/')) throw new Error('Invalid bounded resource configuration')
const recordings = config.guard_recording_ids ?? []
if (!Array.isArray(recordings) || recordings.length > 4 || recordings.some(id => typeof id !== 'string' || !/^rec_[a-z0-9]+$/.test(id)) ||
    (recordings.length && (typeof config.guard_session_id !== 'string' || !/^ses_[a-z0-9]+$/.test(config.guard_session_id)))) throw new Error('Guard needs explicit owned session/recording IDs')
mkdirSync(output, { mode: 0o700 }) // Fresh output only; preserve prior evidence.
const fd = openSync(join(output, 'samples.jsonl'), 'wx', 0o600)
let stopped = false, guarded = false, samples = 0
const guardResults = []
process.on('SIGINT', () => { stopped = true }); process.on('SIGTERM', () => { stopped = true })
const began = process.hrtime.bigint(), until = began + BigInt(Math.round(config.seconds * 1e9))
const cpuSeconds = text => text.split(':').reduce((n, v) => n * 60 + Number(v), 0)
console.log(JSON.stringify({ state: 'sampling', pids: config.pids, seconds: config.seconds, guard_recordings: recordings.length, output }))
try {
  while (!stopped && process.hrtime.bigint() < until) {
    const host = process.hrtime.bigint(), wall = new Date().toISOString()
    let processes = null, pressure = null, processError = false, pressureError = false
    try {
      const raw = execFileSync('/bin/ps', ['-p', config.pids.join(','), '-o', 'pid=,rss=,time='], { encoding: 'utf8', timeout: 1500 })
      processes = raw.trim().split('\n').filter(Boolean).map(row => { const [pid, rss, time] = row.trim().split(/\s+/); return { pid: Number(pid), rss_kib: Number(rss), cpu_seconds: cpuSeconds(time) } })
      if (processes.some(p => !Number.isFinite(p.cpu_seconds) || !Number.isFinite(p.rss_kib))) throw new Error('Invalid process sample')
    } catch { processError = true }
    try {
      const p = JSON.parse(readFileSync(config.pressure_path, 'utf8'))
      const age = Date.now() - Date.parse(p.timestamp)
      pressure = { timestamp: p.timestamp, age_ms: Number.isFinite(age) ? age : null,
        fresh: Number.isFinite(age) && age >= 0 && age < 45000, pressure_level: p.pressure_level,
        paging_mib_s: p.paging_mib_s, compressor_mib_s: p.compressor_mib_s }
    } catch { pressureError = true }
    writeSync(fd, JSON.stringify({ observer_monotonic_ns: host.toString(), wall, processes, pressure, process_error: processError, pressure_error: pressureError }) + '\n'); samples++
    if (!guarded && recordings.length && pressure?.fresh && Number.isFinite(pressure.pressure_level) && pressure.pressure_level > 2) {
      guarded = true
      for (const id of recordings) {
        const result = { recording_id: id, stop_submissions: 0 }
        try {
          const r = await call('record.get', { recording_id: id })
          if (r.session_id !== config.guard_session_id) result.outcome = 'refused_session_mismatch'
          else if (!['scheduled', 'arming', 'recording'].includes(r.state)) result.outcome = 'already_settled_or_finalizing'
          else {
            result.stop_submissions = 1 // Unknown response is never replayed.
            const reply = await call('record.stop', { recording_id: id })
            result.outcome = 'stop_reply_received'; result.recording_state = reply.state
            writeFileSync(join(output, id + '-guard-stop.json'), JSON.stringify(reply, null, 2), { mode: 0o600 })
          }
        } catch { result.outcome = result.stop_submissions ? 'stop_outcome_unknown; recover same ID without replay' : 'readback_unavailable; no stop submitted' }
        guardResults.push(result)
      }
    }
    const remainingMs = Number(until - process.hrtime.bigint()) / 1e6
    if (remainingMs > 0) await new Promise(r => setTimeout(r, Math.min(config.interval_ms ?? 1000, remainingMs)))
  }
} finally {
  closeSync(fd)
  const result = { schema: 'bounded-resource-observer/v1', state: 'terminal', samples, guarded, guard_results: guardResults,
    duration_s: Number(process.hrtime.bigint() - began) / 1e9,
    qualification: 'Observer process clock is not capture clock; wall intervals are approximate. Cumulative ps CPU and RSS only; no GPU attribution, ownership authentication or capacity proof.' }
  writeFileSync(join(output, 'result.json'), JSON.stringify(result, null, 2) + '\n', { mode: 0o600 }); console.log(JSON.stringify(result))
}
