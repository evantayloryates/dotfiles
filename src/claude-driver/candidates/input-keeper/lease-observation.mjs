// Independent live owner/guardian observations for linked keeper adapters.
// Evidence paths are constrained by the adapter's trusted root, never reports.
import {lstatSync,realpathSync,readFileSync} from 'node:fs'
import {join,dirname,basename} from 'node:path'
import {spawnSync,execFileSync} from 'node:child_process'
import {readProcessSnapshot,matchingLockDescriptors} from './process-observation.mjs'
const fail=reason=>Object.assign(new Error('Keeper lease observation: '+reason),{category:'input_keeper_lease_failed'})
const probe='import os,sys,stat,fcntl\np=os.open(sys.argv[1],os.O_RDWR|os.O_NOFOLLOW|os.O_NONBLOCK)\ntry:\n s=os.fstat(p)\n if not stat.S_ISREG(s.st_mode) or s.st_uid!=os.getuid() or s.st_dev!=int(sys.argv[2]) or s.st_ino!=int(sys.argv[3]):sys.exit(3)\n try:fcntl.flock(p,fcntl.LOCK_EX|fcntl.LOCK_NB)\n except BlockingIOError:print("held")\n else:print("free")\nfinally:os.close(p)'
export function probeUiKernelLock(lockPath,identity){
 // Startup latency is not lock contention. Only LOCK_NB's actual result may
 // classify held/free; process deadline or changed inode is unavailable.
 const result=spawnSync('/usr/bin/python3',['-I','-c',probe,lockPath,String(identity.dev),String(identity.ino)],{encoding:'utf8',timeout:3000,env:{PATH:'/usr/bin:/bin'}})
 if(result.error||result.status!==0||!['held','free'].includes(result.stdout.trim()))throw fail('kernel lock observation unavailable')
 return {held:result.stdout.trim()==='held',identity:{dev:identity.dev,ino:identity.ino}}
}
export function admitUiOwnerEvidence({owner,guardians,evidenceDir},root){
 const s=lstatSync(evidenceDir)
 const name=basename(evidenceDir),ownedName=/^lease-[A-Za-z0-9_-]+$/.test(name)||/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(name)
 if(dirname(evidenceDir)!==root||!ownedName||realpathSync(evidenceDir)!==evidenceDir||!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.getuid()||(s.mode&0o077)!==0)throw fail('private lease directory unverified')
 const file=join(evidenceDir,'ui-owner.json'),f=lstatSync(file)
 if(!f.isFile()||f.isSymbolicLink()||f.uid!==process.getuid()||(f.mode&0o077)!==0)throw fail('owner checkpoint unverified')
 const row=JSON.parse(readFileSync(file)),rows=readProcessSnapshot().rows,current=rows.find(p=>p.pid===owner.pid)
 if(row.ownerPid!==owner.pid||row.group!==owner.group||row.watchReady!==true||row.lock?.dev!==owner.lock.dev||row.lock?.ino!==owner.lock.ino||!current||current.group!==owner.group||guardians.length!==1||guardians[0].pid!==row.watcherPid||!rows.some(p=>p.pid===row.watcherPid&&p.ppid===owner.pid&&p.group===owner.group))throw fail('live checked owner/watchdog binding unverified')
 return {evidenceDir,owner,guardians}
}
export function observeUiKernelOwner(owner,lockPath){
 const file=lstatSync(lockPath),current=readProcessSnapshot().rows.find(p=>p.pid===owner.pid)
 if(!file.isFile()||file.isSymbolicLink()||file.uid!==process.getuid()||file.dev!==owner.lock.dev||file.ino!==owner.lock.ino||!current||current.group!==owner.group)return {alive:false,owner,kernelLockHeld:false}
 const fields=execFileSync('/usr/sbin/lsof',['-nP','-a','-p',String(owner.pid),'-d','3','-F','pfiD'],{encoding:'utf8',timeout:3000,maxBuffer:32768})
 return {alive:true,owner,kernelLockHeld:matchingLockDescriptors(fields,owner.lock).some(f=>f.fd==='3')&&probeUiKernelLock(lockPath,owner.lock).held}
}
export function observeRetiredUiPeers({owner,guardians}){
 const allowed=new Set([owner.pid,...guardians.map(g=>g.pid)]),remaining=readProcessSnapshot().rows.filter(p=>p.group===owner.group&&!allowed.has(p.pid))
 return {clientsRetired:remaining.length===0,workerPeersRetired:remaining.length===0,remaining}
}
