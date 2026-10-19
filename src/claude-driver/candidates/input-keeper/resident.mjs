// Candidate resident control transport. Adapters are linked trusted code, not
// request/module names. No native runtime, UI tasks or shell execution here.
import {createServer,connect} from 'node:net'
import {randomBytes,randomUUID,createHash,timingSafeEqual} from 'node:crypto'
import {lstatSync,existsSync,readFileSync,writeFileSync,mkdirSync,chmodSync} from 'node:fs'
import {join} from 'node:path'
import {createKeeperLifetime} from './lifetime.mjs'
import {writeJsonAtomic} from '../../lib/state.mjs'
const fail=reason=>Object.assign(new Error('Keeper resident: '+reason),{category:'input_keeper_resident_failed',reason})
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(x)
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x
const digest=x=>createHash('sha256').update(JSON.stringify(canonical(x))).digest('hex')
function privatePath(path,kind){
 const s=lstatSync(path)
 if(s.isSymbolicLink()||s.uid!==process.getuid()||(s.mode&0o077)!==0||!s[kind]())throw fail('private control path unverified')
 return s
}
function envelope(m){
 if(!m||m.v!==1||!uuid(m.id)||!uuid(m.generation)||typeof m.auth!=='string'||!/^[a-f0-9]{64}$/.test(m.auth)||!['status','acquire','release','shutdown'].includes(m.op)||!m.args||typeof m.args!=='object'||Array.isArray(m.args)||Object.keys(m).some(k=>!['v','id','generation','auth','op','args'].includes(k)))throw fail('invalid request envelope')
 const allowed=m.op==='acquire'?['owner','guardians']:m.op==='release'?['token','generation','outcome']:[]
 if(Object.keys(m.args).some(k=>!allowed.includes(k)))throw fail('request fields outside control scope')
}
export function inspectKeeperRequest(dir,id,generation){
 if(!uuid(id)||!uuid(generation))throw fail('invalid request identity')
 privatePath(dir,'isDirectory');const path=join(dir,'requests',id+'.json');privatePath(join(dir,'requests'),'isDirectory');privatePath(path,'isFile')
 const row=JSON.parse(readFileSync(path));if(row.generation!==generation||row.id!==id)throw fail('request generation mismatch')
 return row
}
export async function serveKeeperResident({dir,epoch,controlDir=dir},adapters){
 privatePath(dir,'isDirectory');privatePath(controlDir,'isDirectory')
 const socketPath=join(controlDir,'s');if(Buffer.byteLength(socketPath)>100||existsSync(socketPath))throw fail('control endpoint unavailable; no unlink or adoption')
 const keeper=await createKeeperLifetime({evidence:join(dir,'keeper.json'),epoch},adapters)
 const generation=keeper.snapshot().generation,auth=randomBytes(32).toString('hex'),authPath=join(dir,'auth-'+generation)
 writeFileSync(authPath,auth,{flag:'wx',mode:0o600})
 const requestDir=join(dir,'requests');if(!existsSync(requestDir))mkdirSync(requestDir,{mode:0o700});privatePath(requestDir,'isDirectory')
 const registration={version:1,pid:process.pid,generation,epoch,controlDir,authFile:'auth-'+generation,phase:'starting'}
 const saveRegistration=()=>writeJsonAtomic(join(dir,'resident.json'),registration)
 saveRegistration()
 try{await keeper.start()}catch(error){registration.phase='fenced';saveRegistration();throw error}
 const connections=new Set();let shutting=false,resolveClosed,rejectClosed
 const closed=new Promise((resolve,reject)=>{resolveClosed=resolve;rejectClosed=reject})
 closed.catch(()=>{}) // startup failure may precede delivery of this handle
 const server=createServer({allowHalfOpen:true},socket=>{
  if(connections.size>=32||shutting){socket.destroy();return}
  connections.add(socket);socket.setTimeout(15000,()=>socket.destroy());socket.on('error',()=>{});socket.once('close',()=>connections.delete(socket))
  let buffer=Buffer.alloc(0),consumed=false
  socket.on('data',chunk=>{
   if(consumed){socket.destroy();return}
   buffer=Buffer.concat([buffer,chunk]);if(buffer.length>16384){socket.destroy();return}
   const newline=buffer.indexOf(10);if(newline<0)return
   consumed=true
   if(newline!==buffer.length-1){socket.destroy();return}
   void (async()=>{
    let m
    const reply=body=>{if(!socket.destroyed)socket.end(JSON.stringify({v:1,id:m?.id??null,generation,...body})+'\n')}
    try{
     m=JSON.parse(buffer.subarray(0,newline));envelope(m)
     if(m.generation!==generation||!timingSafeEqual(Buffer.from(m.auth),Buffer.from(auth)))throw fail('control authentication refused')
     if(shutting)throw fail('resident is shutting down')
     if(m.op==='status'){reply({ok:true,result:await keeper.inspect()});return}
     const path=join(requestDir,m.id+'.json'),fingerprint=digest({op:m.op,args:m.args}),old=existsSync(path)?inspectKeeperRequest(dir,m.id,generation):null
     if(old){
      if(old.fingerprint!==fingerprint)throw fail('request id belongs to different arguments')
      reply({ok:true,result:old.state==='completed'?old.result:{state:old.state,replayAllowed:false,requestId:m.id},reused:true});return
     }
     // Persist before invoking even the first adapter. Disconnection does not
     // cancel or rerun this action; a pending intent remains uncertain.
     const row={version:1,id:m.id,generation,fingerprint,op:m.op,state:'pending',createdAt:new Date().toISOString()}
     writeJsonAtomic(path,row)
     try{
      const result=m.op==='acquire'?await keeper.acquire(m.args):m.op==='release'?await keeper.release(m.args):await keeper.shutdown()
      row.state='completed';row.result=result;row.finishedAt=new Date().toISOString();writeJsonAtomic(path,row)
      reply({ok:true,result,reused:false})
      if(m.op==='shutdown'){
       shutting=true;registration.phase='closed';saveRegistration()
       // Flush this reply before closing every control connection. Resource
       // lifetime was already independently retired by keeper.shutdown().
       for(const other of connections)if(other!==socket)other.end()
       server.close(error=>error?rejectClosed(error):resolveClosed(result))
      }
     }catch(error){row.state='failed';row.error={category:error.category??'input_keeper_failed',reason:error.reason??'trusted-adapter-failed'};row.finishedAt=new Date().toISOString();writeJsonAtomic(path,row);reply({ok:false,error:row.error})}
    }catch(error){reply({ok:false,error:{category:error.category??'invalid_control_request',reason:error.reason??'invalid-control-request'}})}
   })().catch(error=>{socket.destroy();rejectClosed(error)})
  })
 })
 server.on('error',error=>{registration.phase='fenced';saveRegistration();rejectClosed(error)})
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(socketPath,resolve)})
 chmodSync(socketPath,0o600);const s=privatePath(socketPath,'isSocket')
 registration.socket={dev:s.dev,ino:s.ino};registration.phase='ready';saveRegistration()
 return {generation,pid:process.pid,closed,keeper}
}

// Fresh connection for each request; a CLI/MCP connection is not the resident
// lifetime. Callers retain returned IDs and reconcile uncertainty explicitly.
export function connectKeeperResident({dir,epoch,controlDir=dir}){
 privatePath(dir,'isDirectory');privatePath(controlDir,'isDirectory');privatePath(join(dir,'resident.json'),'isFile')
 const registration=JSON.parse(readFileSync(join(dir,'resident.json')))
 if(registration.version!==1||registration.epoch!==epoch||registration.controlDir!==controlDir||registration.phase!=='ready'||!uuid(registration.generation)||registration.authFile!=='auth-'+registration.generation)throw fail('resident registration not ready for this epoch')
 const socketPath=join(controlDir,'s'),s=privatePath(socketPath,'isSocket'),authPath=join(dir,registration.authFile);privatePath(authPath,'isFile')
 if(s.dev!==registration.socket?.dev||s.ino!==registration.socket?.ino)throw fail('control socket identity changed')
 const auth=readFileSync(authPath,'utf8');if(!/^[a-f0-9]{64}$/.test(auth))throw fail('control key invalid')
 return {generation:registration.generation,request:(op,args={},options={})=>{
  const id=options.id??randomUUID(),request={v:1,id,generation:registration.generation,auth,op,args};envelope(request)
  return new Promise((resolve,reject)=>{
   let buffer=Buffer.alloc(0),finished=false
   const socket=connect(socketPath),finish=(error,value)=>{if(finished)return;finished=true;clearTimeout(timer);socket.destroy();error?reject(Object.assign(error,{requestId:id,generation:registration.generation})):resolve(value)}
   const timer=setTimeout(()=>finish(fail('response uncertain; retain request id, do not replay')),options.timeoutMs??10000)
   socket.on('error',()=>finish(fail('control connection unavailable; do not restart')))
   socket.on('connect',()=>{
    try{const current=privatePath(socketPath,'isSocket');if(current.dev!==s.dev||current.ino!==s.ino)throw fail('control endpoint changed');socket.end(JSON.stringify(request)+'\n')}catch(error){finish(error)}
   })
   socket.on('data',chunk=>{
    buffer=Buffer.concat([buffer,chunk]);if(buffer.length>65536){finish(fail('control response exceeds bound'));return}
    const newline=buffer.indexOf(10);if(newline<0)return
    try{const response=JSON.parse(buffer.subarray(0,newline));if(response.v!==1||response.id!==id||response.generation!==registration.generation)throw fail('response identity mismatch');if(!response.ok)throw Object.assign(fail(response.error?.reason??'control operation failed'),{remoteError:response.error});finish(null,{...response,requestId:id})}catch(error){finish(error)}
   })
   socket.on('end',()=>{if(!finished)finish(fail('response missing; retain request id, do not replay'))})
  })
 }}
}
