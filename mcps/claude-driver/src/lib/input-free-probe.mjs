// Reuse the qualified ordinary runner. Never infer a target or turn a
// read-only preflight into a mutation profile because --live was supplied.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export function inputFreeProbeArgs(kind, flags) {
  if (!['preflight', 'probe'].includes(kind)) throw Error('unknown input-free qualification kind')
  const allowed = new Set(['input-free', 'controller', 'session', ...(kind === 'probe' ? ['live'] : [])])
  for (const key of Object.keys(flags)) if (!allowed.has(key)) throw Error(`unsupported input-free ${kind} flag: --${key}`)
  if (flags['input-free'] !== true) throw Error('--input-free must be an explicit flag')
  const sid = /^local_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
  if (!sid.test(flags.controller || '') || !sid.test(flags.session || '') || flags.controller === flags.session)
    throw Error('input-free qualification requires distinct exact --controller and --session IDs')
  if (kind === 'probe' && flags.live !== true) throw Error('input-free probe requires --live; use preflight for read-only checks')
  return ['--ordinary', '--input-free', '--controller', flags.controller, '--session', flags.session,
    kind === 'preflight' ? '--preflight-only' : '--live']
}

export async function inputFreeProbe(kind, flags) {
  const args = inputFreeProbeArgs(kind, flags)
  console.error(`Input-free ${kind}: ordinary profile only; creation/focus/archive, groups, windows, person-only cards and outage recovery are separate gates.`)
  const child = spawn(process.execPath, [fileURLToPath(new URL('../scripts/live-v2.mjs', import.meta.url)), ...args], { stdio: 'inherit' })
  return await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => signal ? reject(Error(`input-free ${kind} interrupted by ${signal}; reconcile saved report before retry`)) : resolve(code ?? 1))
  })
}
