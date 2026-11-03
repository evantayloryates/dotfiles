import { readSession } from '../src/harness.mjs'

export default {
  name: 'zdr_read',
  title: 'Read a past harness answer',
  description: 'Read the question and the final de-identified answer of a zdr_ask session, or wait for one still running. Never returns tool output. Sessions run by the app\'s analyst agent are refused; use zdr_open for those.',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: { type: 'string', description: 'session_id from zdr_ask or zdr_sessions.' },
      wait_seconds: { type: 'number', description: 'If the session is still running, wait up to this long (at most 540) for it to finish. Default 0.' },
    },
    required: ['session_id'],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: ({ session_id, wait_seconds }, { signal }) => readSession(session_id, signal, { waitSeconds: wait_seconds }),
}
