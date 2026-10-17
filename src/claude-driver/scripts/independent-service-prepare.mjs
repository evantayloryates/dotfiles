#!/usr/bin/env node
import {mkdirSync,writeFileSync,lstatSync} from 'node:fs'
import {join} from 'node:path'
import {spawnSync} from 'node:child_process'
import {randomBytes} from 'node:crypto'
import {homedir} from 'node:os'
import {STATE_DIR,BROKER_DIR} from '../lib/state.mjs'
import {RUNTIME_BUILD} from '../lib/build.mjs'
import {stageRelease} from '../lib/releases.mjs'
import {getRecord} from '../lib/sessions.mjs'
import {peerRecord} from '../lib/peer-direct.mjs'
import {independentServiceState} from '../lib/independent-service-result.mjs'
import {buildNativePeerServicePackage} from '../lib/native-peer-service-package.mjs'
import {resolveClaudeBinary} from '../lib/paths.mjs'
const present=p=>{try{lstatSync(p);return true}catch(e){if(e.code!=='ENOENT')throw e;return false}}
try{
 const [session,serviceId,life,capacity,pid,start,archiveJson,metadataJson,modelFlag]=process.argv.slice(2),lifetimeSec=Number(life),maxRequests=Number(capacity),record=getRecord(session)
 if(modelFlag!==undefined&&modelFlag!=='model')throw Error('model capability')
 if(independentServiceState(session,serviceId,record)!==STATE_DIR||record.permissionMode!=='bypassPermissions'||record.isArchived||!Number.isInteger(lifetimeSec)||lifetimeSec<60||lifetimeSec>3600||!Number.isInteger(maxRequests)||maxRequests<1||maxRequests>128||present(STATE_DIR))throw Error('namespace')
 const guard=()=>{const peer=peerRecord(session,Number(pid));if(!peer||peer.procStart!==start||peer.cwd!==record.cwd||peer.status!=='idle'||peer.entrypoint!=='claude-desktop'||peer.version!=='2.1.299')throw Error('epoch')}
 guard();for(const dir of [record.cwd,join(record.cwd,'.claude-driver-services')]){if(present(dir)){const st=lstatSync(dir);if(st.isSymbolicLink()||!st.isDirectory()||st.uid!==process.getuid())throw Error('directory')}}
 mkdirSync(STATE_DIR,{recursive:true,mode:0o700});const planFile=join(STATE_DIR,'preparation.json'),plan={schemaVersion:1,kind:'independent-service-preparation',serviceId,sessionId:session,receiverCwd:record.cwd,build:RUNTIME_BUILD,epoch:{pid:Number(pid),procStart:start},phase:'before-release',installed:false,settingsChanged:false,at:Date.now()}
 const save=()=>writeFileSync(planFile,JSON.stringify(plan,null,2),{mode:0o600});save()
 const release=await stageRelease();guard();if(release.build!==RUNTIME_BUILD)throw Error('source changed')
 const archiveTarget=archiveJson===undefined?undefined:JSON.parse(archiveJson),metadataTarget=metadataJson===undefined?undefined:JSON.parse(metadataJson)
 const now=Date.now(),binding={version:1,id:serviceId,receiverCwd:record.cwd,sessionId:session,build:release.build},config={id:serviceId,token:'claude-driver service-read '+randomBytes(16).toString('hex'),brokerSession:session,brokerCwd:BROKER_DIR,build:release.build,notBefore:now,deadline:now+lifetimeSec*1000,maxRequests,serviceStateBinding:binding,...archiveTarget?{archiveTarget}:{},...metadataTarget?{metadataTarget}:{},...modelFlag==='model'?{metadataModelControl:true}:{}},pkg=buildNativePeerServicePackage(config),candidate=join(STATE_DIR,'module-candidate')
 plan.release=release;plan.config=config;plan.hashes=pkg.hashes;plan.phase='before-candidate';save()
 for(const[name,body]of Object.entries(pkg.files)){mkdirSync(join(candidate,name,'..'),{recursive:true,mode:0o700});writeFileSync(join(candidate,name),body,{flag:'wx',mode:0o600})}
 plan.phase='before-validation';save();const validation=spawnSync(resolveClaudeBinary(),['plugin','validate',candidate],{env:{HOME:homedir(),PATH:'/usr/bin:/bin'},encoding:'utf8',timeout:20000,maxBuffer:65536});writeFileSync(join(STATE_DIR,'validation.txt'),String(validation.stdout??'')+String(validation.stderr??''),{flag:'wx',mode:0o600});if(validation.status!==0){plan.phase='validation-failed';save();writeFileSync(join(STATE_DIR,'validation-failure.json'),JSON.stringify({status:validation.status,signal:validation.signal,errorCode:validation.error?.code}),{flag:'wx',mode:0o600});throw Error('validation failed')}guard()
 plan.phase='prepared';plan.preparedAt=Date.now();save()
 console.log(JSON.stringify({serviceId,sessionId:session,build:release.build,phase:'prepared',preparationFile:planFile,candidateDirectory:candidate,releaseRoot:release.root,prepared:true,verified:true,installed:false,settingsChanged:false,readinessObserved:false,servingQualified:false,deadline:config.deadline,maxRequests}))
}catch{console.error('independent service preparation refused; no module publication or settings change');process.exitCode=1}
