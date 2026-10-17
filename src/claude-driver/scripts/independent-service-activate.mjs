#!/usr/bin/env node
import {mkdirSync,lstatSync,writeFileSync} from 'node:fs'
import {join,dirname} from 'node:path'
import {homedir} from 'node:os'
import {createHash,randomUUID} from 'node:crypto'
import {STATE_DIR,BROKER_DIR,writeJsonAtomic} from '../lib/state.mjs'
import {getRecord} from '../lib/sessions.mjs'
import {peerRecord} from '../lib/peer-direct.mjs'
import {independentServiceState} from '../lib/independent-service-result.mjs'
import {independentBytes as bytes,independentJson as json,buildSealedIndependentPackage,loadIndependentServiceContext} from '../lib/independent-service-context.mjs'
import {verifyNativeServiceDirectory} from '../lib/native-service-ownership.mjs'
import {publishNativeServiceDirectory} from '../lib/native-service-enroll.mjs'
import {buildNativeServicePolicy} from '../lib/native-service-policy.mjs'
import {commitRelease,validateRelease} from '../lib/releases.mjs'
import {runIndependentActivation,independentPathPresent} from '../lib/independent-service-activate.mjs'
const present=independentPathPresent
const ownedDir=p=>{const s=lstatSync(p);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.getuid())throw Error('directory')}
const hash=b=>createHash('sha256').update(b).digest('hex')
let phase='namespace'
try{
 const [session,serviceId,pid,start]=process.argv.slice(2),record=getRecord(session)
 if(independentServiceState(session,serviceId,record)!==STATE_DIR)throw Error('namespace')
 for(const d of [record.cwd,dirname(STATE_DIR),STATE_DIR])ownedDir(d)
 phase='preparation';const prep=json(join(STATE_DIR,'preparation.json')),config=prep.config,activation=join(STATE_DIR,'activation.json')
 if(prep.kind!=='independent-service-preparation'||prep.phase!=='prepared'||prep.serviceId!==serviceId||prep.sessionId!==session||prep.receiverCwd!==record.cwd||prep.epoch?.pid!==Number(pid)||prep.epoch.procStart!==start||config?.id!==serviceId||config.brokerSession!==session||config.brokerCwd!==BROKER_DIR||config.serviceStateBinding?.receiverCwd!==record.cwd||config.deadline<Date.now()+30000||present(activation))throw Error('preparation')
 phase='candidate';const release=validateRelease(prep.build),pkg=await buildSealedIndependentPackage(prep.build,config),candidate=join(STATE_DIR,'module-candidate')
 verifyNativeServiceDirectory(candidate,pkg.hashes)
 phase='destination';const modRoot=join(process.env.CLAUDE_CONFIG_DIR||join(homedir(),'.claude'),'dev-mods'),sessionMods=join(modRoot,session.slice(6)),dest=join(sessionMods,'desktop-bridge-native-peer-service'),settingsDir=join(record.cwd,'.claude'),settingsFile=join(settingsDir,'settings.json')
 // Existing settings/modules need an explicit predecessor transition. Never
 // overwrite them or interpret absent bookkeeping as proof of ownership.
 if(present(dest)||present(settingsFile)||present(BROKER_DIR))throw Error('nonempty receiver')
 phase='directories';ownedDir(dirname(modRoot));if(present(modRoot))ownedDir(modRoot);if(present(sessionMods))ownedDir(sessionMods);if(present(settingsDir))ownedDir(settingsDir)
 const guard=()=>{const r=getRecord(session),peer=peerRecord(session,Number(pid));if(!peer||peer.procStart!==start||peer.cwd!==record.cwd||peer.status!=='idle'||peer.version!=='2.1.299'||peer.entrypoint!=='claude-desktop'||r.permissionMode!=='bypassPermissions'||r.isArchived||config.deadline<Date.now()+1000)throw Error('epoch')}
 phase='epoch';guard();phase='ledger';const ledger={schemaVersion:1,kind:'independent-service-activation',serviceId,sessionId:session,build:prep.build,epoch:prep.epoch,phase:'created',at:Date.now(),destination:dest,settingsFile,servingQualified:false,scopedUnloadQualified:false}
 writeFileSync(activation,JSON.stringify(ledger,null,2),{flag:'wx',mode:0o600})
 const stage=join(STATE_DIR,'module-publication');for(const [name,body]of Object.entries(pkg.files)){mkdirSync(dirname(join(stage,name)),{recursive:true,mode:0o700});writeFileSync(join(stage,name),body,{flag:'wx',mode:0o600})}
 const policy=buildNativeServicePolicy({binding:config.serviceStateBinding,epoch:prep.epoch,brokerDir:BROKER_DIR,scriptSha256:hash(bytes(join(release.root,'scripts/broker-stop-rescue.mjs')))})
 mkdirSync(BROKER_DIR,{recursive:true,mode:0o700})
 const result=await runIndependentActivation({guard,record:nextPhase=>{phase=nextPhase;ledger.phase=nextPhase;ledger.updatedAt=Date.now();writeJsonAtomic(activation,ledger)},
 policy:()=>writeFileSync(policy.policyPath,JSON.stringify(policy.policy),{flag:'wx',mode:0o600}),
 pointer:()=>commitRelease(prep.build,{sessionId:session,pid:Number(pid),procStart:start,nonce:randomUUID(),serviceStateBinding:config.serviceStateBinding},()=> 'Independent native service state. No model-driven broker loop is installed here.\n'),
 settings:()=>{mkdirSync(settingsDir,{recursive:true,mode:0o700});ownedDir(settingsDir);writeFileSync(settingsFile,policy.settingsBytes,{flag:'wx',mode:0o600})},
 publish:()=>{mkdirSync(sessionMods,{recursive:true,mode:0o700});ownedDir(modRoot);ownedDir(sessionMods);verifyNativeServiceDirectory(stage,pkg.hashes);publishNativeServiceDirectory(stage,dest)},
 verify:async()=>{await loadIndependentServiceContext(session,serviceId,{requireIdle:true});return {serviceId,sessionId:session,installed:true,settingsInstalled:true,readinessObserved:false,servingQualified:false,scopedUnloadQualified:false,activationFile:activation,deadline:config.deadline}}
 });console.log(JSON.stringify(result))
}catch{console.error('independent service activation refused at '+phase+'; preserve activation record and inspect partial effects');process.exitCode=1}
