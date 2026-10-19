// Synthetic subprocesses only: Unix sockets, IPC and inherited flock fd.
// No native runtime, app, keyboard API, account or network provider is loaded.
import {createServer,connect} from 'node:net'
import {fstatSync} from 'node:fs'
if(!process.send||!process.connected)throw Error('owned fixture IPC required')
const role=process.argv[2],fileIdentity=()=>{
 try{const s=fstatSync(3);return s.isFile()?{dev:s.dev,ino:s.ino}:null}catch{return null}
}
if(role==='resource'){
 const clients=new Set();let closed=0
 const server=createServer(c=>{clients.add(c);c.on('data',()=>{});c.on('end',()=>c.end());c.on('close',()=>{clients.delete(c);closed++})})
 server.listen(process.argv[3],()=>process.send({type:'ready'}))
 process.on('message',m=>{
  if(m.type==='probe')process.send({id:m.id,clients:clients.size,closed,lock:fileIdentity()})
  if(m.type==='stop')server.close(()=>{process.send({id:m.id,stopped:true});process.disconnect()})
 })
}else if(role==='owner'){
 let client
 process.send({type:'ready',lock:fileIdentity()})
 process.on('message',m=>{
  if(m.type==='connect'){
   if(client)throw Error('one client per fixture owner')
   client=connect(m.path,()=>{client.write('one synthetic socket probe');process.send({id:m.id,connected:true})});client.on('error',()=>{})
  }
  if(m.type==='exit')process.disconnect()
  if(m.type==='close'){
   if(client&&!client.destroyed){client.end();client.once('close',()=>process.send({id:m.id,closed:true}))}
   else process.send({id:m.id,closed:true})
  }
 })
}else throw Error('unknown fixture role')
