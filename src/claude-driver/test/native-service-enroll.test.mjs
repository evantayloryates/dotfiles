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

test('public enrollment schema and CLI agree on integer bounds before effects',async()=>{
 const {validateOp}=await import('../lib/driver.mjs'),{spawnSync}=await import('node:child_process')
 assert.equal(validateOp('broker_service_enroll',{experimental:true,lifetime_sec:60,max_requests:4}).name,'broker_service_enroll')
 for(const value of [60.5,'60',Infinity])assert.throws(()=>validateOp('broker_service_enroll',{experimental:true,lifetime_sec:value}))
 for(const value of [59,3601])assert.throws(()=>validateOp('broker_service_enroll',{experimental:true,lifetime_sec:value}),/out of range/)
 const child=spawnSync(process.execPath,[new URL('../cli.mjs',import.meta.url).pathname,'broker_service_enroll','--experimental','true','--lifetime_sec','59'],{encoding:'utf8'})
 assert.equal(child.status,1);assert.match(child.stderr,/out of range: lifetime_sec/);assert.equal(child.stdout,'')
})
