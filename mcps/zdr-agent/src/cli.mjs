// Runs read-only or idempotent `zdr-harness` subcommands. Output is aggregate
// status text; the CLI never prints secrets for these subcommands.
import { execFile } from 'node:child_process'
import { HARNESS_CLI } from './paths.mjs'
import { HarnessError } from './harness.mjs'

export function harnessCli(args, { signal, timeoutMs = 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(HARNESS_CLI, args, { signal, timeout: timeoutMs, maxBuffer: 1 << 20 }, (err, stdout, stderr) => {
      if (err && err.name === 'AbortError') return reject(err)
      if (err && !stdout) return reject(new HarnessError(`zdr-harness ${args.join(' ')} failed: ${(stderr || err.message).trim().slice(0, 500)}`))
      resolve({ ok: !err, stdout: stdout.trim(), stderr: stderr.trim() })
    })
  })
}
