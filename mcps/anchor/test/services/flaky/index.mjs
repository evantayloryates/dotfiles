import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
if (existsSync(join(here, 'CRASH_ON_START'))) throw new Error('flaky: refusing to start (CRASH_ON_START present)')
let n = 0
export const ops = {
  ok: { description: 'Succeeds.', handler: () => 'fine' },
  crash: { description: 'Kills the process with an uncaught error.', class: 'write', handler: () => { setImmediate(() => { throw new Error('flaky: boom in crash op') }); return new Promise(() => {}) } },
  vary: { description: 'Crashes with a different message every time.', handler: () => { n++; setImmediate(() => { throw new Error(`flaky: variant ${'abcdefghij'[n % 10]} failure`) }); return new Promise(() => {}) } },
  hang: { description: 'Never answers.', handler: () => new Promise(() => {}) },
}
