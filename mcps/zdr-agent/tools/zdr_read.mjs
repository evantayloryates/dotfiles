import { readSession } from '../src/harness.mjs'

export default {
  name: 'zdr_read',
  title: 'Read a past harness answer',
  description: 'Read the question and the final de-identified answer of a past zdr_ask session. Never returns tool output. Sessions run by the app\'s analyst agent are refused; use zdr_open for those.',
  inputSchema: {
    type: 'object',
    properties: { session_id: { type: 'string', description: 'session_id from zdr_ask or zdr_sessions.' } },
    required: ['session_id'],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: ({ session_id }, { signal }) => readSession(session_id, signal),
}
