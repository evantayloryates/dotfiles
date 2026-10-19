export const ops = {
  work: {
    description: 'Work for ms milliseconds, reporting progress.',
    strategy: 'job',
    class: 'write',
    inputSchema: { type: 'object', properties: { ms: { type: 'number' } }, required: ['ms'] },
    handler: async ({ ms }, ctx) => {
      const steps = 5
      for (let i = 1; i <= steps; i++) {
        await new Promise((r, j) => {
          const t = setTimeout(r, ms / steps)
          ctx.signal.addEventListener('abort', () => { clearTimeout(t); j(new Error('cancelled by caller')) }, { once: true })
        })
        ctx.progress(`step ${i}/${steps}`, i / steps)
      }
      return { worked: ms }
    },
  },
}
