import './env.mjs'
import { execSync } from 'node:child_process'
import { startHarness } from './client.mjs'
import { paths } from '../src/paths.mjs'
const P = paths()
try { execSync(`pkill -9 -f "${P.daemon} --state ${P.stateDir}"`) } catch {}
const hs = await Promise.all(Array.from({ length: 5 }, (_, i) => startHarness({ name: `racer-${i}` })))
await new Promise((r) => setTimeout(r, 500))
const pids = execSync(`pgrep -f "${P.daemon} --state ${P.stateDir}" || true`).toString().trim().split('\n').filter(Boolean)
const st = await Promise.all(hs.map((h) => h.call('anchor_run', { calls: [{ target: 'anchor:status' }] })))
console.log('daemons running:', pids.length, 'session counts seen:', st.map((r) => r.data[0].value?.sessions).join(','))
for (const h of hs) await h.close()
