import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {buildNativePeerServicePackage} from '../lib/native-peer-service-package.mjs'
import {resolveClaudeBinary} from '../lib/paths.mjs'
test('installed native validator accepts all three service registration graphs without load or inference',()=>{
 const config={id:'a'.repeat(32),token:'claude-driver service-read '+'b'.repeat(32),brokerSession:'local_11111111-1111-4111-8111-111111111111',brokerCwd:'/Users/taylor/.local/state/claude-driver/broker',build:'c'.repeat(64),notBefore:1000,deadline:2000,maxRequests:2}
 for(const extra of [{},{marker:true,observeRetiredServiceId:null},{marker:true,observeRetiredServiceId:null,resourceProbe:true}]){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'native-package-'))
  try{
   const pkg=buildNativePeerServicePackage({...config,...extra})
   for(const[p,bytes]of Object.entries(pkg.files)){fs.mkdirSync(path.dirname(root+'/'+p),{recursive:true});fs.writeFileSync(root+'/'+p,bytes,{flag:'wx',mode:0o600})}
   let succeeded=false;try{execFileSync(resolveClaudeBinary(),['plugin','validate',root],{stdio:'pipe',timeout:20000});succeeded=true}catch{}
   assert.equal(succeeded,true,'generated registration graph must pass installed validator')
  }finally{fs.rmSync(root,{recursive:true,force:true})}
 }
})
