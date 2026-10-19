// Line diff of one operation called directly and through anchor.
//   node harness/diff-op.mjs <service> <tool> [json-args]
import './env.mjs'
import { join } from 'node:path'
import { startHarness } from './client.mjs'
import { connectStdio } from '../src/mcp-client.mjs'
import { paths } from '../src/paths.mjs'
const [id, tool, json = '{}'] = process.argv.slice(2)
const args = JSON.parse(json)
const direct = await connectStdio([join(paths().lab, '../../mcps/_shared/bin/run'), id], { startTimeoutMs: 60000 })
const d = (await direct.callTool(tool, args)).content.map((x) => x.text).join('\n')
const h = await startHarness({ name: 'diff-op', env: { ANCHOR_ALERT_BACKEND: 'log' } })
const r = (await h.call('anchor_run', { calls: [{ target: `${id}:${tool}`, args }] })).data[0]
const a = typeof r.value === 'string' ? r.value : JSON.stringify(r.value)
const dl = d.split('\n'), al = a.split('\n')
for (let i = 0; i < Math.max(dl.length, al.length); i++) if (dl[i] !== al[i]) console.log(`direct: ${dl[i]}\nanchor: ${al[i]}`)
direct.close(); await h.close()
