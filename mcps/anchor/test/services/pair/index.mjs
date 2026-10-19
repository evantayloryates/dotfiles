export const ops = {
  boom: { handler: () => new Promise(() => setTimeout(() => { throw new Error('pair: boom') }, 30)) },
  wait: { handler: () => new Promise((r) => setTimeout(() => r('waited'), 150)) },
}
