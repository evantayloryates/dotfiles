// Directory lock: mkdir is atomic; a dead holder's lock is taken over by
// renaming it away (only one rename can win), so stale locks from crashed
// processes never block forever and never let two holders in.
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const alive = (pid) => { try { process.kill(pid, 0); return true } catch (e) { return e.code === 'EPERM' } }

export function tryLock(dir) {
  try {
    mkdirSync(dir)
    writeFileSync(join(dir, 'pid'), String(process.pid))
    return true
  } catch (err) {
    if (err.code !== 'EEXIST') throw err
  }
  let holder = 0
  try { holder = Number(readFileSync(join(dir, 'pid'), 'utf8')) } catch {}
  if (!holder) return false // being created right now; caller retries
  if (alive(holder)) return false
  const grave = `${dir}.stale.${process.pid}`
  try { renameSync(dir, grave) } catch { return false }
  rmSync(grave, { recursive: true, force: true })
  return tryLock(dir)
}

export async function withLock(dir, fn, { waitMs = 30_000 } = {}) {
  const until = Date.now() + waitMs
  while (!tryLock(dir)) {
    if (Date.now() > until) return { ok: false, refused: 'busy', error: `another release operation holds ${dir}` }
    await new Promise((r) => setTimeout(r, 50))
  }
  try {
    return await fn()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
