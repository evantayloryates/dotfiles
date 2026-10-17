import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,existsSync,readdirSync,lstatSync,chmodSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
const source=fileURLToPath(new URL('../',import.meta.url)),session='local_11111111-1111-4111-8111-111111111111',service='a'.repeat(32)
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex')
function fixture(t){
 const root=mkdtempSync(join(tmpdir(),'driver-offline-retire-')),cwd=join(root,'receiver'),state=join(cwd,'.claude-driver-services',service),config=join(root,'claude')
 for(const path of [state,join(config,'sessions'),join(root,'app')])mkdirSync(path,{recursive:true,mode:0o700})
 // Only this test's own sealed fixture tree is unsealed for cleanup.
 t.after(()=>{const unseal=p=>{const s=lstatSync(p);chmodSync(p,s.isDirectory()?0o700:0o600);if(s.isDirectory())for(const n of readdirSync(p))unseal(join(p,n))};unseal(root);rmSync(root,{recursive:true})})
 const exited=spawnSync(process.execPath,['-e','process.stdout.write(String(process.pid))'],{encoding:'utf8'});assert.equal(exited.status,0)
 const env={...process.env,CLAUDE_DRIVER_STATE_DIR:state,CLAUDE_CONFIG_DIR:config,CLAUDE_DRIVER_PEER_SESSIONS_DIR:join(config,'sessions'),CLAUDE_DRIVER_APP_SUPPORT:join(root,'app'),FIXTURE_CWD:cwd,FIXTURE_PID:exited.stdout,FIXTURE_SESSION:session,FIXTURE_SERVICE:service}
 const builder=`
 import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';import {join} from 'node:path';import {createHash} from 'node:crypto';
 import {stageRelease,commitRelease} from ${JSON.stringify(new URL('../lib/releases.mjs',import.meta.url).href)};
 import {buildNativePeerServicePackage} from ${JSON.stringify(new URL('../lib/native-peer-service-package.mjs',import.meta.url).href)};
 import {buildNativeServicePolicy} from ${JSON.stringify(new URL('../lib/native-service-policy.mjs',import.meta.url).href)};
 const cwd=process.env.FIXTURE_CWD,session=process.env.FIXTURE_SESSION,id=process.env.FIXTURE_SERVICE,broker=join(process.env.CLAUDE_DRIVER_STATE_DIR,'broker');mkdirSync(broker,{recursive:true});
 const release=await stageRelease(),binding={version:1,id,receiverCwd:cwd,sessionId:session,build:release.build},epoch={pid:Number(process.env.FIXTURE_PID),procStart:'synthetic exited fixture; not a native epoch'};
 commitRelease(release.build,{sessionId:session,...epoch,nonce:'fixture',serviceStateBinding:binding},()=> 'Synthetic fixture only; never delivered');
 const now=Date.now(),config={id,token:'claude-driver service-read '+'b'.repeat(32),brokerSession:session,brokerCwd:broker,build:release.build,notBefore:now,deadline:now+60000,maxRequests:2,serviceStateBinding:binding},pkg=buildNativePeerServicePackage(config),module=join(process.env.CLAUDE_CONFIG_DIR,'dev-mods',session.slice(6),'desktop-bridge-native-peer-service');
 for(const [name,body]of Object.entries(pkg.files)){mkdirSync(join(module,name,'..'),{recursive:true});writeFileSync(join(module,name),body)}
 const script=join(release.root,'scripts/broker-stop-rescue.mjs'),p=buildNativeServicePolicy({binding,epoch,brokerDir:broker,scriptSha256:createHash('sha256').update(readFileSync(script)).digest('hex')});mkdirSync(join(cwd,'.claude'),{recursive:true});writeFileSync(p.settingsPath,p.settingsBytes);writeFileSync(p.policyPath,JSON.stringify(p.policy));
 console.log(JSON.stringify({build:release.build}));`
 const made=spawnSync(process.execPath,['--input-type=module','-e',builder],{env,encoding:'utf8',timeout:20000,maxBuffer:65536});assert.equal(made.status,0,made.stderr)
 const run=(name,...args)=>spawnSync(process.execPath,[join(source,'scripts',name),session,service,'--offline',cwd,...args],{env,encoding:'utf8',timeout:20000,maxBuffer:65536})
 return {root,cwd,state,config,env,run,broker:join(state,'broker'),module:join(config,'dev-mods',session.slice(6),'desktop-bridge-native-peer-service')}
}
test('delivered offline commands retain exact module/settings bytes and owned STOP after process absence',t=>{
 const f=fixture(t),registration=sha(join(f.module,'hooks/register.js')),settings=sha(join(f.cwd,'.claude/settings.json'))
 const stopped=f.run('independent-service-quiesce.mjs');assert.equal(stopped.status,0,stopped.stderr);const q=JSON.parse(stopped.stdout);assert.equal(q.quiescent,true);assert.equal(q.previousPidObservedAbsent,true)
 const retired=f.run('independent-service-retire.mjs');assert.equal(retired.status,0,retired.stderr);const r=JSON.parse(retired.stdout);assert.equal(r.filesRetired,true);assert.equal(r.processRetired,false);assert.equal(r.automaticResume,false)
 assert.equal(existsSync(f.module),false);assert.equal(sha(join(f.state,'retired-module/hooks/register.js')),registration);assert.equal(sha(join(f.cwd,'.claude/settings.json')),settings);assert.equal(existsSync(join(f.broker,'STOP')),true)
 const repeat=f.run('independent-service-retire.mjs');assert.equal(repeat.status,0,repeat.stderr);assert.equal(JSON.parse(repeat.stdout).filesRetired,true)
 const settingsRetired=f.run('independent-service-retire.mjs','--settings');assert.equal(settingsRetired.status,0,settingsRetired.stderr);assert.equal(sha(join(f.state,'retired-settings.json')),settings);assert.equal(existsSync(join(f.cwd,'.claude/settings.json')),false)
 assert.equal(f.run('independent-service-retire.mjs','--settings').status,0)
})
test('an original unresolved offline attempt keeps STOP and prevents module retirement',t=>{
 const f=fixture(t),id='rpeer'+'c'.repeat(32),intent=join(f.broker,'.native-service-'+id+'.intent.json'),body=JSON.stringify({serviceId:service,requestId:id,brokerSession:session})
 writeFileSync(intent,body)
 const stopped=f.run('independent-service-quiesce.mjs');assert.equal(stopped.status,0,stopped.stderr);const q=JSON.parse(stopped.stdout);assert.equal(q.quiescent,false);assert.deepEqual(q.unresolvedRequestIds,[id])
 const retired=f.run('independent-service-retire.mjs');assert.notEqual(retired.status,0);assert.equal(existsSync(f.module),true);assert.equal(existsSync(join(f.state,'retired-module')),false);assert.equal(readFileSync(intent,'utf8'),body);assert.equal(existsSync(join(f.broker,'STOP')),true)
})
test('changed registration refuses STOP; destination collision refuses retirement without overwriting',t=>{
 const drift=fixture(t),file=join(drift.module,'hooks/register.js'),original=readFileSync(file,'utf8');writeFileSync(file,original+'\n// changed fixture source\n')
 assert.notEqual(drift.run('independent-service-quiesce.mjs').status,0);assert.equal(existsSync(join(drift.broker,'STOP')),false);assert.equal(existsSync(join(drift.state,'quiescence.json')),false)
 const collision=fixture(t);assert.equal(collision.run('independent-service-quiesce.mjs').status,0);mkdirSync(join(collision.state,'retired-module'));writeFileSync(join(collision.state,'retired-module/keep'),'preserve me')
 assert.notEqual(collision.run('independent-service-retire.mjs').status,0);assert.equal(existsSync(collision.module),true);assert.equal(readFileSync(join(collision.state,'retired-module/keep'),'utf8'),'preserve me');assert.equal(existsSync(join(collision.state,'retirement.json')),false)
})
