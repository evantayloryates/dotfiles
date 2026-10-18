import {test} from 'node:test'
import assert from 'node:assert/strict'
import {projectArchiveSelection,requireCompleteProjectArchive} from '../lib/project-archive-control.mjs'
test('generic project archive excludes caller and configured legacy/primary/standby service actors',()=>{const ids=['caller','legacy','primary','standby','ordinary'],r=projectArchiveSelection(ids.map(sessionId=>({sessionId})),ids.slice(0,4));assert.deepEqual(r.targets.map(r=>r.sessionId),['ordinary']);assert.equal(r.excluded.length,4)})
test('cleanup requires exact complete unique saved archive scope',()=>{assert.doesNotThrow(()=>requireCompleteProjectArchive(['a','b'],['a','b']));for(const [targets,done]of [[['a','b'],['a']],[['a'],['foreign']],[['a'],['a','foreign']],[['a','a'],['a']]])assert.throws(()=>requireCompleteProjectArchive(targets,done),e=>e.category==='outcome_unknown'&&e.detail.folderDeleted===false&&e.detail.retrySafe===false)})
