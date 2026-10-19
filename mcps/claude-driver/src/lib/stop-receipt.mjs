// Interpret exact reviewed desktop stop receipts before observing idle. A native
// success envelope may still mean declined, starting, or pending human input.
export function stopReceipt(value, sessionId) {
  let text
  if(typeof value==='string')text=value
  else if(value&&value.isError!==true&&Array.isArray(value.content)&&value.content.length===1&&value.content[0]?.type==='text')text=value.content[0].text
  if(typeof text!=='string'||text.length>4096||typeof sessionId!=='string'||!/^local_[a-f0-9-]{36}$/.test(sessionId))return {state:'unknown'}
  const label=`session ${sessionId}`, match=(prefix,suffix)=>{
    if(!text.startsWith(prefix+label)||!text.endsWith(suffix))return false
    const middle=text.slice((prefix+label).length,text.length-suffix.length)
    return middle===''||middle.startsWith(' (')&&middle.endsWith(')')&&!/[\r\n]/.test(middle)
  }
  if(match('Stopped ',"'s current turn. It stays open; anything already queued there runs next."))return {state:'stopped'}
  const sessionLabel=`Session ${sessionId}`
  if(text.startsWith(sessionLabel)&&text.endsWith(' is idle; nothing to stop.')){
    const middle=text.slice(sessionLabel.length,-' is idle; nothing to stop.'.length)
    if(middle===''||middle.startsWith(' (')&&middle.endsWith(')')&&!/[\r\n]/.test(middle))return {state:'already_idle'}
  }
  if(match('Asked '," to stop; its host is reconnecting (or it runs in the cloud), so the interrupt lands when the link is back. Check get_session before assuming it stopped."))return {state:'requested'}
  return {state:'unknown'}
}
