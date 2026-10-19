import test from 'node:test'
import assert from 'node:assert/strict'
import {entryEpochEvidence} from '../src/lib/releases.mjs'
test('absent process is distinct from a live foreign epoch without granting readiness',()=>{
 const args={pointer:{pid:123,procStart:'expected',sessionId:'local_fixture'},sessionId:'local_fixture'}
 assert.deepEqual(entryEpochEvidence({...args,live:null}),{verified:false,reason:'native-process-unavailable'})
 assert.deepEqual(entryEpochEvidence({...args,live:{pid:456,procStart:'other',entrypoint:'claude-desktop'}}),{verified:false,reason:'native-process-epoch-mismatch'})
 assert.deepEqual(entryEpochEvidence({...args,live:{pid:123,procStart:'expected',entrypoint:'claude-desktop'}}),{verified:false,reason:'entry-evidence-unavailable'})
})
