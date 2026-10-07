import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {enrollNativeService,publishNativeServiceDirectory} from '../lib/native-service-enroll.mjs'
test('invalid enrollment bounds refuse before broker access',async()=>{
 for(const options of [{lifetimeSec:59},{lifetimeSec:3601},{lifetimeSec:NaN},{maxRequests:0},{maxRequests:129},{maxRequests:1.5}])await assert.rejects(enrollNativeService(options),/bounds/)
})
test('atomic native publication refuses existing directory and preserves both owners',{skip:process.platform!=='darwin'},()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'native-enroll-')),stage=path.join(root,'stage'),dest=path.join(root,'dest')
 try{
  fs.mkdirSync(stage);fs.writeFileSync(path.join(stage,'candidate'),'prepared')
  fs.mkdirSync(dest)
  assert.throws(()=>publishNativeServiceDirectory(stage,dest))
  assert.equal(fs.readFileSync(path.join(stage,'candidate'),'utf8'),'prepared');assert.deepEqual(fs.readdirSync(dest),[])
  fs.rmdirSync(dest);publishNativeServiceDirectory(stage,dest)
  assert.equal(fs.existsSync(stage),false);assert.equal(fs.readFileSync(path.join(dest,'candidate'),'utf8'),'prepared')
 }finally{fs.rmSync(root,{recursive:true,force:true})}
})
