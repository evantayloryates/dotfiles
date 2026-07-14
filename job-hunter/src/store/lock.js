import fs from 'node:fs/promises';
import { LOCK_PATH } from '../paths.js';
import { nowIso } from '../util.js';

export class LockConflictError extends Error { constructor(message) { super(message); this.exitCode = 3; } }
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } };

export async function inspectLock(lockPath = LOCK_PATH) {
  try {
    const lock = JSON.parse(await fs.readFile(lockPath, 'utf8'));
    return { exists: true, active: Number.isInteger(lock.pid) && alive(lock.pid), lock };
  } catch (error) {
    if (error.code === 'ENOENT') return { exists: false, active: false, lock: null };
    return { exists: true, active: false, lock: null, error: error.message };
  }
}

export async function acquireLock(command, lockPath = LOCK_PATH) {
  const record = { pid: process.pid, started_at: nowIso(), command };
  try { await fs.writeFile(lockPath, `${JSON.stringify(record)}\n`, { flag: 'wx', mode: 0o600 }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const state = await inspectLock(lockPath);
    const kind = state.active ? 'active' : 'stale';
    throw new LockConflictError(`Job Hunter ${kind} lock at ${lockPath}${state.lock ? ` (pid ${state.lock.pid}, started ${state.lock.started_at})` : ''}. Remove a stale lock explicitly after verifying its process is gone.`);
  }
  let released = false;
  return async () => { if (!released) { released = true; await fs.rm(lockPath, { force: true }); } };
}
