export function sessionContext(ctx) {
  return `echo text and add numbers (generated for ${ctx.clientInfo?.name || 'an unknown harness'})`
}
