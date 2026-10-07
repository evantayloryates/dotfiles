import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {randomBytes} from 'node:crypto'
import {spawn} from 'node:child_process'
import {buildNativeResourceProgram} from '../lib/native-resource-program.mjs'
const root='/Users/taylor/.local/state/claude-driver/broker'
test('resource configuration refuses foreign roots and invalid identities',()=>{
 assert.throws(()=>buildNativeResourceProgram({serviceId:'bad',deadline:1,evidenceRoot:root}))
 assert.throws(()=>buildNativeResourceProgram({serviceId:'a'.repeat(32),deadline:1,evidenceRoot:'/tmp'}))
})
test('real owned test child self-exits and records deadline without external termination',async()=>{
 const serviceId=randomBytes(16).toString('hex'),deadline=Date.now()+3000
 const stem=root+'/.native-service-resource-'+serviceId
 const child=spawn(process.execPath,['--input-type=module','-e',buildNativeResourceProgram({serviceId,deadline,evidenceRoot:root})],{stdio:['ignore','pipe','pipe']})
 let output='';child.stdout.on('data',chunk=>{output+=chunk})
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve)})
 assert.equal(code,0)
 const ready=JSON.parse(fs.readFileSync(stem+'.ready.json','utf8')),exit=JSON.parse(fs.readFileSync(stem+'.exit.json','utf8'))
 assert.equal(ready.pid,child.pid);assert.equal(ready.serviceId,serviceId)
 assert.equal(exit.reason,'deadline');assert.equal(exit.code,0)
 assert.ok(Date.parse(exit.exitedAt)>=deadline)
 assert.match(output,/owned-resource-alive/)
 // Preserve the bounded metadata as evidence; random identifiers are never reused.
})
test('expired child refuses before writing readiness',async()=>{
 const serviceId=randomBytes(16).toString('hex')
 const child=spawn(process.execPath,['--input-type=module','-e',buildNativeResourceProgram({serviceId,deadline:Date.now()-1,evidenceRoot:root})],{stdio:'ignore'})
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve)})
 assert.equal(code,64);assert.equal(fs.existsSync(root+'/.native-service-resource-'+serviceId+'.ready.json'),false)
})
