const tag = Math.random().toString(36).slice(2, 8)
setTimeout(() => { throw new Error(`chaos: spontaneous failure ${tag.replace(/\d/g, 'x')}`) }, 150)
export const ops = { ping: { description: 'Answers if still alive.', handler: () => 'pong' } }
