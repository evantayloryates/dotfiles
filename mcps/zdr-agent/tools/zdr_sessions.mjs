import { listSessions } from '../src/harness.mjs'

export default {
  name: 'zdr_sessions',
  title: 'List ZDR harness sessions',
  description: 'List the 20 most recent ZDR harness sessions (id, last update, title).',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: (_args, { signal }) => listSessions(signal),
}
