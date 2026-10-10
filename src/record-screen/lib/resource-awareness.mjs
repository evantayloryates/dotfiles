// Advisory host observations for production planning. Never change capture
// settings, stop a take, reserve resources or infer capacity from slot counts.
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { statfs, mkdir, writeFile, readdir, unlink, rmdir } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { enginePaths } from './client.mjs'

const exec = promisify(execFile)
const GiB = 1024 ** 3

export function resourceAdvice(observation, plan) {
  const reasons = [], unknowns = []
  const pressure = observation.memory_pressure_level
  if (pressure === 2 || pressure === 4) reasons.push(pressure === 4 ? 'critical_memory_pressure' : 'warning_memory_pressure')
  else if (pressure !== 1) unknowns.push('memory_pressure_unavailable')
  const disk = observation.free_disk_bytes
  if (!Number.isFinite(disk)) unknowns.push('disk_availability_unavailable')
  else if (disk < 2 * GiB) reasons.push('low_disk_headroom')
  const load = observation.load_average_1m, cpus = observation.logical_cpu_count
  if (Number.isFinite(load) && cpus > 0 && load / cpus >= 0.9) reasons.push('elevated_one_minute_load')
  else if (!Number.isFinite(load) || !(cpus > 0)) unknowns.push('host_load_unavailable')
  const unfinished = plan.resource_guidance?.unfinished_recordings
  const limit = plan.resource_guidance?.configured_max_concurrent
  const proposed = plan.request.redundancy === 'window_app_display' ? 3 : plan.request.redundancy === 'window_display' ? 2 : 1
  if (Number.isInteger(unfinished) && Number.isInteger(limit) && unfinished + proposed > limit) reasons.push('configured_slots_exceeded')
  const recommendation = reasons.length ? 'review_before_start' : unknowns.length ? 'insufficient_observations' : 'no_coarse_pressure_observed'
  return { schema: 'record-screen-resource-awareness/v1', observation, recommendation, reasons, unknowns,
    proposed_sources: proposed,
    suggested_actions: reasons.length ? ['Defer optional backups and heavy previews until pressure settles; verify essential coverage before dropping a backup.', 'Consider shorter future takes at application checkpoints. Preserve the requested fidelity unless the director explicitly chooses a change.', 'Recheck before starting; do not stop or restart other agents’ recordings.'] : ['Use the measured profile and normal source checks; this observation does not establish spare capacity.'],
    policy: { kind: 'initial_conservative_advisory', low_disk_bytes: 2 * GiB, elevated_load_per_logical_cpu: 0.9,
      settings_changed: false, admission_enforced: false, resources_reserved: false, capacity_qualified: false },
    limits: ['Pressure and disk are coarse observations; one-minute load is not instantaneous CPU utilization.', 'GPU/encoder occupancy, thermal headroom and production duration remain unknown.', 'Sample bounds use this adapter’s monotonic clock, not the recorder source clock; no millisecond host/capture calibration is claimed.', 'Observations apply only to this planning call, not continuously throughout a take.'] }
}

export async function observeResourcePlan(plan, { root = enginePaths().root, collect, retain = 128 } = {}) {
  const began = process.hrtime.bigint(), started = new Date().toISOString()
  let observations
  try {
    observations = collect ? await collect() : await (async () => {
      const [pressure, disk] = await Promise.allSettled([
        exec('/usr/sbin/sysctl', ['-n', 'kern.memorystatus_vm_pressure_level'], { timeout: 1000, maxBuffer: 1024 }),
        statfs(root),
      ])
      const level = pressure.status === 'fulfilled' ? Number(pressure.value.stdout.trim()) : null
      const bytes = disk.status === 'fulfilled' ? Number(disk.value.bavail) * Number(disk.value.bsize) : null
      return { memory_pressure_level: [1, 2, 4].includes(level) ? level : null,
        free_disk_bytes: Number.isSafeInteger(bytes) && bytes >= 0 ? bytes : null,
        load_average_1m: os.loadavg()[0], logical_cpu_count: os.cpus().length }
    })()
  } catch { observations = { memory_pressure_level: null, free_disk_bytes: null, load_average_1m: null, logical_cpu_count: null } }
  const awareness = resourceAdvice({ ...observations, sampled_at: started,
    sample_started_monotonic_ns: began.toString(), sample_ended_monotonic_ns: process.hrtime.bigint().toString(),
    freshness: 'this planning call; not a live monitor' }, plan)
  const directory = join(root, 'diagnostics', 'resource-plans'), lock = join(directory, '.writer-lock')
  let held = false
  awareness.audit = { state: 'unavailable', retention: retain, content: 'resource observations and compact decisions only; no app text, titles, raw inputs or footage' }
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 })
    await mkdir(lock, { mode: 0o700 }); held = true
    const id = Date.now().toString().padStart(16, '0') + '-' + randomUUID() + '.json'
    const record = { schema: awareness.schema, observed_engine: plan.engine, engine_clock_observation: plan.observed_at,
      workload: { duration_s: plan.request.duration_s, fps: plan.request.fps, max_width: plan.request.max_width, redundancy: plan.request.redundancy },
      awareness: { ...awareness, audit: undefined } }
    await writeFile(join(directory, id), JSON.stringify(record) + '\n', { mode: 0o600, flag: 'wx' })
    const files = (await readdir(directory)).filter(name => /^\d{16}-[a-f0-9-]{36}\.json$/.test(name)).sort()
    await Promise.all(files.slice(0, Math.max(0, files.length - retain)).map(name => unlink(join(directory, name))))
    awareness.audit = { ...awareness.audit, state: 'saved', path: join(directory, id) }
  } catch { awareness.audit.reason = 'bounded_audit_write_unavailable_or_another_writer_active' }
  finally { if (held) await rmdir(lock).catch(() => {}) }
  return { ...plan, resource_guidance: { ...plan.resource_guidance, adaptive: awareness } }
}
