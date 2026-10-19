// One tool per file. The file name must equal the tool name.
export default {
  name: 'example_echo',
  title: 'Echo text',
  description: 'Return the text you send. Replace this with a real tool.',
  inputSchema: {
    type: 'object',
    properties: { text: { type: 'string', description: 'Text to echo.' } },
    required: ['text'],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  // (args, ctx) => string | { content, isError }. ctx has signal, progress(message), client.
  handler: async ({ text }) => text,
}
