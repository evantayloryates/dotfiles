// Bounded watch: exits when the ticket leaves "dispatched" or after maxMin.
import './env.mjs'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { paths } from '../src/paths.mjs'
const [id, maxMin = '30', once] = process.argv.slice(2)
const state = () => {
  const recs = readFileSync(join(paths().stateDir, 'tickets.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((r) => r.id === id && r.t === 'state')
  if (!recs.length) throw new Error(`WATCHER BROKEN: no state records for ${id}`)
  return recs.at(-1)
}
const until = Date.now() + Number(maxMin) * 60_000
for (;;) {
  const s = state()
  if (s.state !== 'dispatched' || once) { console.log(JSON.stringify(s)); process.exit(s.state === 'dispatched' ? 2 : 0) }
  if (Date.now() > until) { console.log(`TIMEOUT: ${id} still dispatched after ${maxMin} min`); process.exit(3) }
  await new Promise((r) => setTimeout(r, 10_000))
}
