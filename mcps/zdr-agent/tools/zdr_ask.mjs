import { ask } from '../src/harness.mjs'

export default {
  name: 'zdr_ask',
  title: 'Ask the ZDR harness',
  description:
    "Ask Kickoff's zero-data-retention harness a question about Amplitude analytics, BugSnag errors, " +
    'PostHog product data, production Lambda logs in CloudWatch, the live production database and call transcripts, ' +
    'or Slack (including #rd-bugs-and-feature-requests, which is read only through this tool, never the Slack connector). ' +
    'The harness runs the tool calls on a ZDR OpenAI key and returns only a de-identified answer ' +
    '(counts, rates, error classes, object IDs, links; never user identifiers or raw payloads). ' +
    'Pass session_id from a previous answer to ask a follow-up in the same conversation. ' +
    'Answers can take a few minutes.',
  inputSchema: {
    type: 'object',
    properties: {
      question: { type: 'string', minLength: 1, description: 'The question. Include the project, date range and any filters.' },
      session_id: { type: 'string', description: 'Optional session_id from a previous zdr_ask answer. Sessions started in the app cannot be continued here.' },
      format: { type: 'string', enum: ['text', 'json'], description: 'json returns {answer, figures, filters, withheld} for further computation.' },
    },
    required: ['question'],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, openWorldHint: true },
  handler: (args, { signal }) => {
    if (typeof args.question !== 'string' || !args.question.trim()) throw Object.assign(new Error('"question" must be a non-empty string'), { expected: true })
    return ask(args, signal)
  },
}
