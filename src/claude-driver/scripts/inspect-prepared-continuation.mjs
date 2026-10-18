#!/usr/bin/env node
// Read-only sealed candidate inspection in its exact per-service state namespace.
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {STATE_DIR} from '../lib/state.mjs'
import {readReceiverFile} from '../lib/receiver-runtime-selection.mjs'
import {buildSealedIndependentPackage} from '../lib/independent-service-context.mjs'
import {verifyNativeServiceDirectory} from '../lib/native-service-ownership.mjs'
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex')
try{
 const [serviceId,build,expectedSha]=process.argv.slice(2)
 if(process.argv.slice(2).length!==3||!/^[a-f0-9]{32}$/.test(serviceId??'')||[build,expectedSha].some(x=>!/^[a-f0-9]{64}$/.test(x??'')))throw Error('exact candidate context required')
 const file=join(STATE_DIR,'preparation.json'),p=JSON.parse(readReceiverFile(file,1048576))
 if(digest(p)!==expectedSha||p.kind!=='independent-service-preparation'||p.phase!=='prepared'||p.serviceId!==serviceId||p.build!==build||p.config?.id!==serviceId||p.config.build!==build)throw Error('candidate context changed')
 const pkg=await buildSealedIndependentPackage(build,p.config);verifyNativeServiceDirectory(join(STATE_DIR,'module-candidate'),pkg.hashes)
 if(digest(JSON.parse(readReceiverFile(file,1048576)))!==expectedSha)throw Error('candidate changed')
 console.log(JSON.stringify({preparedPackageVerified:true,serviceId,build,preparationSha256:expectedSha,effectsPerformed:false,servingQualified:false}))
}catch{console.error('prepared continuation package refused; no effect performed');process.exitCode=1}
