// Scoped child launcher: no retries, no process searches, no raw log export.
// Container-private 64 KiB tail makes an early Next exit diagnosable.
import fs from 'node:fs';
import {spawn} from 'node:child_process';
const dir='/tmp/ios-agent-next-worker';
fs.mkdirSync(dir,{recursive:true,mode:0o700});
const info=fs.lstatSync(dir);
if(!info.isDirectory()||info.isSymbolicLink()||(info.mode&0o077))throw Error('private_worker_trace_required');
const tailFile=dir+'/tail.log',receiptFile=dir+'/status.json';
let tail=Buffer.alloc(0),timer,done=false;
const oom=()=>{try{return Number(fs.readFileSync('/sys/fs/cgroup/memory.events','utf8').match(/^oom_kill (\d+)$/m)?.[1]);}catch{return null;}};
const initialOOM=oom();
const child=spawn('yarn',['start:demo:development'],{stdio:['ignore','pipe','pipe'],detached:true});
const write=value=>fs.writeFileSync(receiptFile,JSON.stringify(value),{mode:0o600});
write({startedAt:Date.now(),pid:child.pid,state:'running',rawLogExported:false});
const flush=()=>{timer=null;fs.writeFileSync(tailFile,tail,{mode:0o600});};
const append=chunk=>{tail=Buffer.concat([tail,chunk]);if(tail.length>65536)tail=tail.subarray(tail.length-65536);if(!timer)timer=setTimeout(flush,1000).unref();};
child.stdout.on('data',append);child.stderr.on('data',append);
const finish=(code,signal)=>{
 if(done)return;done=true;clearTimeout(timer);flush();
 const text=tail.toString('utf8'),afterOOM=oom();
 const kinds=[['heap_exhausted',/heap out of memory/i],['port_busy',/EADDRINUSE/],['module_missing',/MODULE_NOT_FOUND|Cannot find module/],['disk_full',/ENOSPC/],['syntax_error',/SyntaxError/],['bus_error',/Bus error|SIGBUS/],['segmentation_fault',/Segmentation fault|SIGSEGV/]];
 write({endedAt:Date.now(),pid:child.pid,state:'exited',exitCode:code,signal:signal||null,errorKinds:kinds.filter(([,pattern])=>pattern.test(text)).map(([kind])=>kind),oomKillAdvanced:Number.isFinite(initialOOM)&&Number.isFinite(afterOOM)?afterOOM>initialOOM:null,privateTailBytes:tail.length,rawLogExported:false});
};
child.on('error',()=>finish(null,'spawn-failed'));
child.on('exit',finish);
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{try{process.kill(-child.pid,signal);}catch{}});
