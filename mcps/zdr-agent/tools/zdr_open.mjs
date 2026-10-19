import { openInApp } from '../src/harness.mjs'

export default {
  name: 'zdr_open',
  title: 'Open a harness session in the app',
  description:
    "Open a ZDR harness session in ZDR Harness.app on Taylor's screen, where it is shown in full including " +
    'anything the de-identified answer had to withhold. Use this when the answer says a field was withheld.',
  inputSchema: {
    type: 'object',
    properties: { session_id: { type: 'string', description: 'The session_id to open.' } },
    required: ['session_id'],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: ({ session_id }) => openInApp(session_id),
}
