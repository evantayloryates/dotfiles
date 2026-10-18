import {createHash} from 'node:crypto'
import {lstatSync,readdirSync,realpathSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {homedir} from 'node:os'
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
const stamp=s=>({dev:s.dev,ino:s.ino,mode:s.mode,uid:s.uid,size:s.size,mtimeMs:s.mtimeMs,ctimeMs:s.ctimeMs})
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b)
// Metadata only. Hashed/truncated project directory names are deliberately not
// reconstructed from cwd. No transcript or side-directory content is opened.
export function inspectServiceSeedTranscriptAbsence(cliSessionId,{projectsDir=join(homedir(),'.claude','projects'),maxProjects=4096,uid=process.getuid()}={}){
 if(!uuid.test(cliSessionId||'')||!Number.isInteger(maxProjects)||maxProjects<1||maxProjects>4096)throw Error('exact bounded seed transcript identity required')
 const no=reason=>({verified:false,allTranscriptsAbsent:false,reason,contentRead:false,effectsPerformed:false})
 try{
  const root=resolve(projectsDir),before=lstatSync(root)
  if(!before.isDirectory()||before.isSymbolicLink()||before.uid!==uid||before.mode&0o022||realpathSync(root)!==root)return no('project-root-unqualified')
  const names=readdirSync(root).sort();if(names.length>maxProjects)return no('project-inventory-bound')
  const inventory=[],directories=[]
  for(const name of names){const path=join(root,name),s=lstatSync(path);if(s.isSymbolicLink()||s.uid!==uid)return no('project-entry-unqualified');inventory.push({name,...stamp(s)});if(!s.isDirectory())continue;if(s.mode&0o022)return no('project-directory-unqualified');directories.push({path,stamp:stamp(s)})
   for(const candidate of [cliSessionId+'.jsonl',cliSessionId]){try{const found=lstatSync(join(path,candidate));return no(found.isSymbolicLink()?'exact-cli-artifact-linked':'exact-cli-artifact-present')}catch(error){if(error.code!=='ENOENT')throw error}}
  }
  if(!same(readdirSync(root).sort(),names)||!same(stamp(lstatSync(root)),stamp(before)))return no('project-inventory-changed')
  for(const d of directories)if(!same(stamp(lstatSync(d.path)),d.stamp))return no('project-directory-changed')
  const fingerprint=createHash('sha256').update(JSON.stringify({cliSessionId,root,rootStamp:stamp(before),inventory})).digest('hex')
  return {verified:true,allTranscriptsAbsent:true,cliSessionId,projectCount:directories.length,fingerprint,contentRead:false,effectsPerformed:false}
 }catch{return no('project-metadata-unavailable')}
}
