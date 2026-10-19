// Read-only process/descriptor observations. The inspector itself is not a
// resource peer; zombies are not live owners. No argument/environment capture.
import {spawnSync} from 'node:child_process'
export function readProcessSnapshot(inspect=()=>spawnSync('/bin/ps',['-axo','pid=,ppid=,pgid=,stat=,comm='],{encoding:'utf8',timeout:5000,maxBuffer:512*1024})){
 const result=inspect()
 if(result.error||result.status!==0||!Number.isSafeInteger(result.pid)||result.pid<=0)throw Error('keeper process observation unavailable')
 const rows=[]
 for(const line of result.stdout.trim().split('\n')){
  if(!line.trim())continue
  const m=line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/)
  if(!m)throw Error('keeper process observation malformed')
  if(+m[1]!==result.pid&&!m[4].startsWith('Z'))rows.push({pid:+m[1],ppid:+m[2],group:+m[3],path:m[5]})
 }
 return {inspectorPid:result.pid,rows}
}
export function matchingLockDescriptors(output,lock){
 let pid,fd,ino,dev;const matches=[]
 const check=()=>{if(ino===String(lock.ino)&&dev!==undefined&&BigInt(dev)===BigInt(lock.dev))matches.push({pid,fd})}
 for(const line of output.split('\n')){
  if(line[0]==='p'){check();pid=+line.slice(1);fd=ino=dev=undefined}
  else if(line[0]==='f'){check();fd=line.slice(1);ino=dev=undefined}
  else if(line[0]==='i')ino=line.slice(1)
  else if(line[0]==='D')dev=line.slice(1)
 }
 check();return matches
}
