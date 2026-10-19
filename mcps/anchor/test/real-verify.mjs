import './env.mjs'
import { startHarness } from './client.mjs'
const h = await startHarness({ name: 'real-e2e-verify', env: { ANCHOR_DISPATCH_CMD: JSON.stringify([process.execPath, 'src/fixer-headless.mjs']) } })
const r = await h.call('anchor_run', { calls: [{ target: 'mend:get', args: { x: 'deep' } }] })
console.log('call:', JSON.stringify(r.data[0]))
const t = await h.call('anchor_run', { calls: [{ target: 'anchor:ticket.list', args: { mine: false, state: undefined } }] })
console.log('tickets:', JSON.stringify(t.data[0].value.map((x) => [x.id, x.kind, x.lane, x.state, x.links])))
await h.close()
