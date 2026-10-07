import {join} from 'node:path'
import {mkdirSync,readdirSync,unlinkSync,lstatSync} from 'node:fs'
import {STATE_DIR,writeJsonAtomic} from './state.mjs'
import {brokerInfo} from './broker.mjs'
import {serviceHealth} from './service-health.mjs'
export function captureServiceDiagnostics({inference='unknown',trigger='manual'}={}){
 if(!['manual','operation-failure'].includes(trigger))throw Error('invalid diagnostic trigger')
const dir=join(STATE_DIR,'diagnostics');mkdirSync(dir,{recursive:true,mode:0o700})
const snapshot=serviceHealth(brokerInfo(),{inference})
snapshot.inferenceEvidence=inference==='quota-exhausted'?'operator-supplied':'not-probed'
 snapshot.trigger=trigger
const file=join(dir,'health-'+Date.now()+'.json');writeJsonAtomic(file,snapshot)
const files=readdirSync(dir).filter(x=>/^health-\d{13}\.json$/.test(x)).sort()
for(const name of files.slice(0,-32)){const p=join(dir,name),s=lstatSync(p);if(s.isFile()&&!s.isSymbolicLink()&&s.uid===process.getuid())unlinkSync(p)}
return {file,...snapshot}
}
