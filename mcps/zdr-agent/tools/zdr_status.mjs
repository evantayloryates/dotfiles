import { harness } from '../src/harness.mjs'
import { harnessCli } from '../src/cli.mjs'

export default {
  name: 'zdr_status',
  title: 'Harness health',
  description: 'Report ZDR harness health: server, each data connection, the production database tunnel and the Terra archive. Aggregate only.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async (_args, { signal }) => {
    const lines = []
    const health = await harness('GET', '/global/health', { signal }).catch((e) => ({ error: e.message }))
    lines.push(`server: ${health.healthy ? `healthy (opencode ${health.version})` : `unhealthy ${health.error || ''}`.trim()}`)
    const mcp = await harness('GET', '/mcp', { signal }).catch(() => null)
    if (mcp) lines.push(`connections: ${Object.entries(mcp).map(([k, v]) => `${k} ${v.status}`).join(', ')}`)
    const tunnel = await harnessCli(['tunnel', 'status'], { signal }).catch((e) => ({ stdout: e.message }))
    lines.push(tunnel.stdout.split('\n')[0])
    const terra = await harnessCli(['terra-archive', 'status'], { signal }).catch((e) => ({ stdout: '' , err: e.message }))
    try {
      const t = JSON.parse(terra.stdout)
      lines.push(`terra archive: ${t.health}${t.running ? `; running ${JSON.stringify(t.running)}` : ''}`)
    } catch {
      lines.push(`terra archive: status unavailable ${terra.err || ''}`.trim())
    }
    return lines.join('\n')
  },
}
