import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,symlinkSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {validateMetadataControllerEnrollment,retainMetadataControllerEnrollment,readMetadataControllerEnrollment,enrolledMetadataController} from '../lib/metadata-controller-index.mjs'
const target='local_22222222-2222-4222-8222-222222222222',controller='local_11111111-1111-4111-8111-111111111111',row={schemaVersion:1,controllerSession:controller,receiverCwd:'/owned/probe/controller',target:{sessionId:target,cwd:'/owned/probe/target',pid:42,procStart:'original epoch'},enrolledAt:100}
test('enrollment is immutable, idempotent and rejects a changed target epoch without overwriting evidence',()=>{
 const dir=mkdtempSync(join(tmpdir(),'metadata-enrollment-'));try{
  assert.equal(readMetadataControllerEnrollment(target,{dir}),null);const {file}=retainMetadataControllerEnrollment(row,{dir}),before=readFileSync(file);assert.deepEqual(readMetadataControllerEnrollment(target,{dir}),row)
  retainMetadataControllerEnrollment({...row,enrolledAt:101},{dir});assert.deepEqual(readFileSync(file),before)
  assert.throws(()=>retainMetadataControllerEnrollment({...row,target:{...row.target,pid:43}},{dir}),/unqualified/);assert.deepEqual(readFileSync(file),before)
  for(const r of [{...row,target:{...row.target,extra:true}},{...row,controllerSession:target},{...row,receiverCwd:'/other/controller'},{...row,extra:true}])assert.throws(()=>validateMetadataControllerEnrollment(r,target))
 }finally{rmSync(dir,{recursive:true})}
})
test('two enrollment candidates or a symlink cannot silently select an arbitrary controller',()=>{
 const dir=mkdtempSync(join(tmpdir(),'metadata-enrollment-'));try{
  const {file}=retainMetadataControllerEnrollment(row,{dir}),targetDir=join(dir,target);writeFileSync(join(targetDir,'local_33333333-3333-4333-8333-333333333333.json'),JSON.stringify({...row,controllerSession:'local_33333333-3333-4333-8333-333333333333'}));assert.throws(()=>readMetadataControllerEnrollment(target,{dir}),/ambiguous/)
  const linked=join(dir,'linked');symlinkSync(targetDir,linked);assert.throws(()=>readMetadataControllerEnrollment(target,{dir:linked}),/unqualified/)
  assert.equal(readFileSync(file).length>0,true)
 }finally{rmSync(dir,{recursive:true})}
})
test('default selection is exact and stale enrollment never becomes legacy fallback; explicit selection avoids discovery',()=>{
 const deps={read:()=>row,record:s=>s===target?{cwd:row.target.cwd}:{cwd:row.receiverCwd},peer:()=>({pid:42,procStart:'original epoch',hostSessionId:target})}
 assert.equal(enrolledMetadataController(target,{},deps),controller)
 assert.equal(enrolledMetadataController(target,{}, {...deps,read:()=>null}),null)
 for(const patch of [{peer:()=>({pid:43,procStart:'original epoch',hostSessionId:target})},{peer:()=>({pid:42,procStart:'new epoch',hostSessionId:target})},{peer:()=>null},{record:()=>({cwd:'/moved'})}])assert.throws(()=>enrolledMetadataController(target,{}, {...deps,...patch}),/no fallback/)
 assert.equal(enrolledMetadataController(target,{metadata_controller:controller},{read:()=>assert.fail('no discovery')}),controller)
})
