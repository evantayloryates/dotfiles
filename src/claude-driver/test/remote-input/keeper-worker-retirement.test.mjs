// Capability refusals with real descriptors/groups; no native input service.
import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,lstatSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {acquireKernelLock} from '../../lib/kernel-lock.mjs'
for(const mode of ['not-group-leader','foreign-guardian','wrong-lock'])test(`worker retirement refuses ${mode}`,async()=>{
 const dir=mkdtempSync('/private/tmp/keeper-retirement-'),release=await acquireKernelLock(join(dir,'ui.lock')),s=lstatSync(join(dir,'ui.lock'))
 const sentinel=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});let ok=false
 try{
  const lock={dev:s.dev,ino:s.ino+(mode==='wrong-lock'?1:0)},code='import{retireUiWorkerPeers}from '+JSON.stringify(new URL('../../lib/ui-lease-owner.mjs',import.meta.url).href)+';try{await retireUiWorkerPeers('+JSON.stringify({watcherPid:sentinel.pid,lock})+');console.log("UNEXPECTED_SUCCESS")}catch(e){console.log(e.message)}'
  const child=spawn(process.execPath,['--input-type=module','-e',code],{detached:mode!=='not-group-leader',stdio:['ignore','pipe','pipe',release.fd]});let out='',error='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>error+=b)
  const [status]=await once(child,'exit');assert.equal(status,0,error);assert(!out.includes('UNEXPECTED_SUCCESS'));assert.match(out,/live owner\/group\/lock|guardian is live outside/)
  assert.equal(sentinel.exitCode,null);assert.equal(sentinel.signalCode,null);ok=true
 }finally{release();sentinel.kill('SIGTERM');await once(sentinel,'exit');if(ok)rmSync(dir,{recursive:true,force:true});else console.log('retained worker retirement fixture '+dir)}
})
