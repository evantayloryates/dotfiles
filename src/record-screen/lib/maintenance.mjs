import { EngineError } from './client.mjs';

export async function legacyIdle(call, expectedPid) {
  const before = await call('status');
  const jobs = await call('record.list', { active: true, limit: 50 });
  const after = await call('status');
  if (!Number.isInteger(jobs.total) || jobs.total !== 0 || !Array.isArray(after.viewfinder?.lanes) || after.viewfinder.lanes.length || !Array.isArray(after.overlays) || after.overlays.length || before.engine?.pid !== after.engine?.pid || (expectedPid !== undefined && after.engine?.pid !== expectedPid)) {
    throw new EngineError('maintenance_busy', 'Legacy engine is active, changed or has unknown visible work; nothing was restarted');
  }
  return { mode: 'legacy_observed_unfenced', pid: after.engine.pid, limits: ['Missing legacy diagnostics remain unknown; this observation does not fence admissions'] };
}

export async function prepareMaintenance(call, { allowLegacyIdle = false, allowUnfinishedTerminal = false } = {}) {
  const status = await call('status');
  if (status.capabilities?.maintenance_fence === 1) {
    const lease = await call('maintenance.acquire', { ttl_s: 180, allow_unfinished_terminal: allowUnfinishedTerminal });
    return { mode: 'fenced', token: lease.token, pid: status.engine.pid };
  }
  if (!allowLegacyIdle) throw new EngineError('maintenance_unsupported', 'Loaded engine has no idle maintenance fence. The first legacy upgrade requires explicit --legacy-idle after inspecting idle work; nothing was changed');
  return legacyIdle(call, status.engine.pid);
}

export async function validateMaintenance(call, prepared) {
  if (prepared.mode === 'legacy_observed_unfenced') return legacyIdle(call, prepared.pid);
  const value = await call('maintenance.validate', { token: prepared.token });
  if (value.pid !== prepared.pid || value.lease?.ready !== true) throw new EngineError('maintenance_changed', 'Maintenance PID/token changed; no restart was issued');
  return value;
}

export async function releaseMaintenance(call, prepared) {
  if (prepared?.mode === 'fenced') await call('maintenance.release', { token: prepared.token });
}
