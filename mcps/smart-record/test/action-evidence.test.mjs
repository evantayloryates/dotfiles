import test from 'node:test';
import assert from 'node:assert/strict';
import {validateActionEvidence} from '../src/lib/action-evidence.mjs';
test('action evidence retains absolute paths and refuses prose, oversized UTF-8 and controls',()=>{
 for(const refs of [undefined,[],['/tmp/owned proof.json','/tmp/é.json']]){
  const a={evidence_refs:refs};assert.equal(validateActionEvidence(a),a);
 }
 for(const refs of ['text',['Chrome AX URL /league after click'],['relative.json'],['/tmp/\nfile'],['/tmp/\u200bfile'],['/'+ 'é'.repeat(1024)],Array(17).fill('/tmp/proof')]){
  assert.throws(()=>validateActionEvidence({evidence_refs:refs}),e=>e.code==='bad_action_evidence'&&/action has not been closed/.test(e.message));
 }
});
