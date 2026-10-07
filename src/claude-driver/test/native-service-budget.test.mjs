import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {reserveNativeServiceBudget} from '../lib/native-service-budget.mjs'
const service='a'.repeat(32),rid=n=>'rpeer'+String(n).repeat(32)
test('durable budget bounds distinct requests across reloads and never restores uncertain capacity',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'native-budget-'))
 try{assert.equal(reserveNativeServiceBudget(dir,service,rid(1),2).slot,0);assert.throws(()=>reserveNativeServiceBudget(dir,service,rid(1),2),/already reserved/);assert.equal(reserveNativeServiceBudget(dir,service,rid(2),2).slot,1);assert.throws(()=>reserveNativeServiceBudget(dir,service,rid(3),2),/exhausted/);assert.throws(()=>reserveNativeServiceBudget(dir,service,rid(3),3),/evidence refused/)}finally{fs.rmSync(dir,{recursive:true,force:true})}
})
test('corrupt or linked budget cannot be skipped to obtain another slot',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'native-budget-')),file=path.join(dir,'native-service-budget-'+service+'-0.json')
 try{fs.writeFileSync(file,'{}');assert.throws(()=>reserveNativeServiceBudget(dir,service,rid(1),2));fs.unlinkSync(file);fs.symlinkSync('/missing',file);assert.throws(()=>reserveNativeServiceBudget(dir,service,rid(1),2));assert.equal(fs.existsSync(path.join(dir,'native-service-budget-'+service+'-1.json')),false)}finally{fs.rmSync(dir,{recursive:true,force:true})}
})

test('independent host processes cannot exceed durable capacity',async()=>{
 const {spawn}=await import('node:child_process'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'native-budget-race-')),module=new URL('../lib/native-service-budget.mjs',import.meta.url).href
 try{
  const outcomes=await Promise.all([1,2,3].map(n=>new Promise(resolve=>{const code=`import {reserveNativeServiceBudget} from ${JSON.stringify(module)};try{reserveNativeServiceBudget(${JSON.stringify(dir)},${JSON.stringify(service)},${JSON.stringify(rid(n))},2)}catch{process.exitCode=1}`,child=spawn(process.execPath,['--input-type=module','-e',code],{stdio:'ignore'});child.on('exit',resolve)})))
  assert.equal(outcomes.filter(x=>x===0).length,2);assert.equal(fs.readdirSync(dir).length,2)
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
})
