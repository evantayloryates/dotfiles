import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawnSync} from 'node:child_process'
import {fileURLToPath,pathToFileURL} from 'node:url'
test('workspace candidate updates cannot redefine installed sealed service bytes',()=>{
 const root=fs.mkdtempSync(join(tmpdir(),'sealed-service-generator-')),clone=join(root,'source'),state=join(root,'state'),original=fileURLToPath(new URL('../src/',import.meta.url))
 fs.mkdirSync(clone)
 for(const name of ['server.mjs','cli.mjs','lib','scripts','docs','broker-template','candidates'])fs.cpSync(name==='docs'?join(original,'..','docs'):join(original,name),join(clone,name),{recursive:true})
 const code=`import{stageRelease}from ${JSON.stringify(pathToFileURL(join(clone,'lib/releases.mjs')).href)};import{buildNativePeerServicePackage}from ${JSON.stringify(pathToFileURL(join(clone,'lib/native-peer-service-package.mjs')).href)};import{buildSealedIndependentPackage}from ${JSON.stringify(pathToFileURL(join(clone,'lib/independent-service-context.mjs')).href)};import{appendFileSync}from'node:fs';const release=await stageRelease();const id='a'.repeat(32),receiverCwd='/owned/receiver',session='local_11111111-1111-4111-8111-111111111111',config={id,token:'claude-driver service-read '+'b'.repeat(32),brokerSession:session,brokerCwd:receiverCwd+'/.claude-driver-services/'+id+'/broker',build:release.build,notBefore:1000,deadline:2000,maxRequests:2,serviceStateBinding:{version:1,id,receiverCwd,sessionId:session,build:release.build}};const before=buildNativePeerServicePackage(config);appendFileSync(${JSON.stringify(join(clone,'candidates/native-peer-service/register.js'))},${JSON.stringify('\n// deliberate fixture workspace revision\n')});const changed=buildNativePeerServicePackage(config),sealed=await buildSealedIndependentPackage(release.build,config);console.log(JSON.stringify({before:before.hashes,changed:changed.hashes,sealed:sealed.hashes}));`
 function unseal(p){const st=fs.lstatSync(p);if(st.isDirectory()){fs.chmodSync(p,0o700);for(const n of fs.readdirSync(p))unseal(join(p,n))}else if(!st.isSymbolicLink())fs.chmodSync(p,0o600)}
 try{const result=spawnSync(process.execPath,['--input-type=module','-e',code],{env:{...process.env,CLAUDE_DRIVER_STATE_DIR:state},encoding:'utf8',timeout:20000});assert.equal(result.status,0,result.stderr);const row=JSON.parse(result.stdout);assert.notEqual(row.before['hooks/register.js'],row.changed['hooks/register.js']);assert.deepEqual(row.sealed,row.before)}
 finally{unseal(root);fs.rmSync(root,{recursive:true,force:true})}
})
