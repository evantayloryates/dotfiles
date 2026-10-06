// Read-only ownership check against the desktop's local IPC router. The
// daemon's notLoaded/idle status does not establish desktop idleness.
// Protocol observed in desktop 2026-10-06: 4-byte LE frames; method versions
// initialize=0 and thread-owner-discovery=1. Version errors fail closed.
import net from 'node:net'
import {execFileSync} from 'node:child_process'
import {resolveCodexBinary} from '../codex-bridge/lib/codex-paths.mjs'
import {lstatSync} from 'node:fs'
import {homedir} from 'node:os'
import {join} from 'node:path'
import {randomUUID} from 'node:crypto'
export async function desktopOwner(threadId){
  // A new IPC version could otherwise turn 'no compatible owner' into a
  // false 'no owner'. Requalify after desktop updates; meanwhile fail closed.
  try{const app=resolveCodexBinary().split('.app/')[0]+'.app';if(execFileSync('/usr/libexec/PlistBuddy',['-c','Print :CFBundleVersion',join(app,'Contents/Info.plist')],{encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:2000}).trim()!=='13100')return null}catch{return null}
  const path=join(homedir(),'.codex/ipc/ipc.sock')
  try{const s=lstatSync(path);if(!s.isSocket()||s.uid!==process.getuid())return null}catch{return null}
  const socket=net.createConnection(path),pending=new Map();let buffer=Buffer.alloc(0),client='initializing-client'
  function fail(){for(const p of pending.values())p.reject(Error('unavailable'));pending.clear();socket.destroy()}
  socket.on('error',fail);socket.on('close',()=>{for(const p of pending.values())p.reject(Error('closed'));pending.clear()})
  socket.on('data',chunk=>{try{buffer=Buffer.concat([buffer,chunk]);while(buffer.length>=4){const size=buffer.readUInt32LE(0);if(size>1024*1024)throw Error('oversize');if(buffer.length<size+4)return;const row=JSON.parse(buffer.subarray(4,size+4));buffer=buffer.subarray(size+4);if(row.type==='response')pending.get(row.requestId)?.resolve(row)}}catch{fail()}})
  function request(method,params,version){return new Promise((resolve,reject)=>{const requestId=randomUUID(),timer=setTimeout(()=>reject(Error('timeout')),2000);pending.set(requestId,{resolve:r=>{clearTimeout(timer);pending.delete(requestId);resolve(r)},reject:e=>{clearTimeout(timer);pending.delete(requestId);reject(e)}});const body=Buffer.from(JSON.stringify({type:'request',requestId,sourceClientId:client,method,params,version})),head=Buffer.alloc(4);head.writeUInt32LE(body.length);socket.write(Buffer.concat([head,body]))})}
  try{const init=await request('initialize',{clientType:'op-broker-recovery'},0);if(init.resultType!=='success')return null;client=init.result.clientId;const out=await request('thread-owner-discovery',{hostId:'local',conversationId:threadId},1);return out.resultType==='success'?true:out.error==='no-client-found'?false:null}catch{return null}finally{fail()}
}
