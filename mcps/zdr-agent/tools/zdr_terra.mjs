import { harnessCli } from '../src/cli.mjs'

export default {
  name: 'zdr_terra',
  title: 'Terra archive status or start',
  description:
    'Terra webhook archive kept by the harness. status reports health, sealed and open days and the last run. start begins a ' +
    'catch-up run (idempotent: does nothing if one is running or the archive is current). Read archived data through zdr_ask.',
  inputSchema: {
    type: 'object',
    properties: { action: { type: 'string', enum: ['status', 'start'] } },
    required: ['action'],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ action }, { signal }) => {
    // Belt and braces with the kernel's schema check: only these two
    // subcommands may reach the CLI (never run, stop, export or log).
    if (action !== 'status' && action !== 'start') throw Object.assign(new Error('action must be status or start'), { expected: true })
    const r = await harnessCli(['terra-archive', action], { signal, timeoutMs: 120_000 })
    return [r.stdout, r.ok ? '' : r.stderr].filter(Boolean).join('\n')
  },
}
