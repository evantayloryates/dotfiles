import {test} from 'node:test'
import assert from 'node:assert/strict'
import {stopReceipt} from '../lib/stop-receipt.mjs'
const sid='local_00000000-0000-4000-8000-000000000001'
test('reviewed accepted stop receipts retain stopped, pending and already idle distinction',()=>{
 for(const title of ['', ' (synthetic title)']){
  const stopped=`Stopped session ${sid}${title}'s current turn. It stays open; anything already queued there runs next.`
  assert.deepEqual(stopReceipt(stopped,sid),{state:'stopped'})
  assert.deepEqual(stopReceipt({content:[{type:'text',text:stopped}]},sid),{state:'stopped'})
  assert.deepEqual(stopReceipt(`Session ${sid}${title} is idle; nothing to stop.`,sid),{state:'already_idle'})
  assert.deepEqual(stopReceipt(`Asked session ${sid}${title} to stop; its host is reconnecting (or it runs in the cloud), so the interrupt lands when the link is back. Check get_session before assuming it stopped.`,sid),{state:'requested'})
 }
})
test('negative, foreign, malformed and error stop receipts remain unrecognized',()=>{
 const yes=`Stopped session ${sid}'s current turn. It stays open; anything already queued there runs next.`
 for(const value of ['stopped',`Session ${sid} is still starting; there is no turn to stop yet.`,`Session ${sid} was not stopped: it is waiting for the user to answer a request.`,yes+' extra',yes.replace(sid,'local_00000000-0000-4000-8000-000000000002'),yes.replace(sid,sid+' (title\nother)'),{isError:true,content:[{type:'text',text:yes}]},{content:[{type:'text',text:yes},{type:'text',text:yes}]},'x'.repeat(5000)])assert.deepEqual(stopReceipt(value,sid),{state:'unknown'})
})
