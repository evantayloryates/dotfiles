import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {verifyNativeServiceDirectory,nativeServiceStatus,nativeServiceRetirementEligible,nativeServiceFilesystemState} from '../lib/native-service-ownership.mjs'
const hash=x=>createHash('sha256').update(x).digest('hex')
test('owned tree verification refuses additional files, symlink directories and changed bytes',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'native-owner-')),hashes={'.claude-plugin/plugin.json':hash('manifest'),'hooks/hooks.json':hash('hooks'),'hooks/register.js':hash('source')}
 try{
  fs.mkdirSync(root+'/.claude-plugin');fs.mkdirSync(root+'/hooks')
  for(const[p,content]of [['.claude-plugin/plugin.json','manifest'],['hooks/hooks.json','hooks'],['hooks/register.js','source']])fs.writeFileSync(root+'/'+p,content)
  assert.equal(verifyNativeServiceDirectory(root,hashes),true)
  fs.writeFileSync(root+'/foreign','keep');assert.throws(()=>verifyNativeServiceDirectory(root,hashes));assert.equal(fs.readFileSync(root+'/foreign','utf8'),'keep');fs.unlinkSync(root+'/foreign')
  fs.writeFileSync(root+'/hooks/register.js','changed');assert.throws(()=>verifyNativeServiceDirectory(root,hashes));fs.writeFileSync(root+'/hooks/register.js','source')
  fs.renameSync(root+'/hooks',root+'/saved');fs.symlinkSync(root+'/saved',root+'/hooks');assert.throws(()=>verifyNativeServiceDirectory(root,hashes))
 }finally{fs.rmSync(root,{recursive:true,force:true})}
})
test('status rejects invalid identity without exposing exceptions',()=>{
 assert.throws(()=>nativeServiceStatus('../../private'),e=>e.category==='native_service_status_refused'&&!e.message.includes('private'))
})

test('retirement requires expiry, exclusive installed ownership and no unresolved attempt',()=>{
 const status={filesInstalled:true,filesRetired:false,expired:true,unresolvedRequests:[]}
 assert.equal(nativeServiceRetirementEligible(status),true)
 for(const change of [{expired:false},{filesInstalled:false},{filesRetired:true},{unresolvedRequests:['rpeer'+'a'.repeat(32)]},{unresolvedRequests:null}])assert.equal(nativeServiceRetirementEligible({...status,...change}),false)
 assert.equal(nativeServiceRetirementEligible(undefined),false)
})

test('native tooling exception accepts only pinned bytes and refuses executable additions',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'native-tooling-')),hashes={'hooks/register.js':hash('source')}
 try{
  fs.mkdirSync(root+'/hooks');fs.writeFileSync(root+'/hooks/register.js','source')
  fs.writeFileSync(root+'/tsconfig.json','{\n  "extends": "./.claude-plugin/types/tsconfig.json"\n}\n')
  assert.throws(()=>verifyNativeServiceDirectory(root,hashes))
  assert.equal(verifyNativeServiceDirectory(root,hashes,{allowTooling:true}),true)
  fs.writeFileSync(root+'/tsconfig.json','{}');assert.throws(()=>verifyNativeServiceDirectory(root,hashes,{allowTooling:true}))
  fs.unlinkSync(root+'/tsconfig.json');fs.writeFileSync(root+'/hooks/foreign.js','keep');assert.throws(()=>verifyNativeServiceDirectory(root,hashes,{allowTooling:true}));assert.equal(fs.readFileSync(root+'/hooks/foreign.js','utf8'),'keep')
 }finally{fs.rmSync(root,{recursive:true,force:true})}
})

test('retired owner distinguishes a verified successor without allowing ambiguous or foreign ownership',()=>{
 assert.deepEqual(nativeServiceFilesystemState({destinationPresent:true,retiredPresent:true,successorVerified:true}),{filesInstalled:false,filesRetired:true,destinationOccupiedByAnotherService:true})
 assert.deepEqual(nativeServiceFilesystemState({destinationPresent:true,retiredPresent:false,ownDestination:true}),{filesInstalled:true,filesRetired:false,destinationOccupiedByAnotherService:false})
 for(const change of [{destinationPresent:true,retiredPresent:true},{destinationPresent:true,retiredPresent:true,ownDestination:true},{destinationPresent:true,retiredPresent:true,ownDestination:true,successorVerified:true},{destinationPresent:null,retiredPresent:false}])assert.throws(()=>nativeServiceFilesystemState(change))
})
