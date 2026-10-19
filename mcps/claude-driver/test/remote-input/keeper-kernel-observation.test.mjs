import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,lstatSync,writeFileSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {acquireKernelLock} from '../../src/lib/kernel-lock.mjs'
import {probeUiKernelLock} from '../../src/candidates/input-keeper/lease-observation.mjs'
test('nonblocking observation distinguishes held and free without a startup contention deadline',async()=>{
 const dir=mkdtempSync('/private/tmp/keeper-lock-probe-'),path=join(dir,'ui.lock'),release=await acquireKernelLock(path),s=lstatSync(path),identity={dev:s.dev,ino:s.ino}
 try{assert.equal(probeUiKernelLock(path,identity).held,true);release();assert.equal(probeUiKernelLock(path,identity).held,false)}finally{release();rmSync(dir,{recursive:true,force:true})}
})
test('missing or changed file identity refuses instead of reporting held',()=>{
 const dir=mkdtempSync('/private/tmp/keeper-lock-probe-'),path=join(dir,'ui.lock');writeFileSync(path,'',{mode:0o600});const s=lstatSync(path)
 try{assert.throws(()=>probeUiKernelLock(path,{dev:s.dev,ino:s.ino+1}),/unavailable/);assert.throws(()=>probeUiKernelLock(join(dir,'absent'),{dev:s.dev,ino:s.ino}),/unavailable/)}finally{rmSync(dir,{recursive:true,force:true})}
})
