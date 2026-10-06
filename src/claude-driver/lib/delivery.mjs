// Normalize observed native receipts, without guessing whether Claude applied
// an instruction. Unknown successful outputs are uncertain, never retry-safe.
export function deliveryReceipt(value) {
  if (value && typeof value === 'object' && ['delivered','queued'].includes(value.delivery))
    return {delivery:value.delivery,messageId:value.message_id}
  const text=typeof value==='string'?value:JSON.stringify(value)
  const delivery=text?.match(/\bdelivery: (delivered|queued)\b/)?.[1]
  if (delivery) return {delivery,messageId:text.match(/message_id: ([0-9a-f-]+)/)?.[1]}
  if (text?.trim()==='Message will be delivered pending tool execution') return {delivery:'queued'}
  return {delivery:'unknown'}
}
