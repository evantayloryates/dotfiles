import { abortSession } from '../src/harness.mjs'

export default {
  name: 'zdr_abort',
  title: 'Stop a running harness session',
  description: 'Stop a harness session that is still working (zdr_sessions shows it as busy). The session and its answer so far are kept.',
  inputSchema: {
    type: 'object',
    properties: { session_id: { type: 'string', description: 'session_id of the busy session.' } },
    required: ['session_id'],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: ({ session_id }, { signal }) => abortSession(session_id, signal),
}
