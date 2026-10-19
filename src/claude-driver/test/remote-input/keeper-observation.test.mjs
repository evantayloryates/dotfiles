import test from 'node:test'
import assert from 'node:assert/strict'
import {readProcessSnapshot,matchingLockDescriptors} from '../../candidates/input-keeper/process-observation.mjs'
test('an actual process snapshot excludes its exact inspector',()=>{
 const result=readProcessSnapshot();assert(result.rows.some(p=>p.pid===process.pid));assert(!result.rows.some(p=>p.pid===result.inspectorPid))
})
test('exclude inspector and zombies without excluding other ps-named peers',()=>{
 const result=readProcessSnapshot(()=>({pid:15,status:0,stdout:'15 10 10 R /bin/ps\n16 10 10 Z helper\n17 10 10 S /bin/ps\n18 10 18 S helper\n'}))
 assert.deepEqual(result.rows.map(p=>p.pid),[17,18])
 assert.throws(()=>readProcessSnapshot(()=>({pid:15,status:1,stdout:''})),/unavailable/)
 assert.throws(()=>readProcessSnapshot(()=>({pid:15,status:0,stdout:'partial record'})),/malformed/)
})
test('descriptor identity follows process and fd boundaries in either field order',()=>{
 const output='p10\nf3\ni100\nD0x2\nf4\nD0x1\ni100\np11\nf7\nD0x2\ni100\nf8\ni200\nD0x2\np12\nf3\ni100\n'
 assert.deepEqual(matchingLockDescriptors(output,{dev:2,ino:100}),[{pid:10,fd:'3'},{pid:11,fd:'7'}])
})
