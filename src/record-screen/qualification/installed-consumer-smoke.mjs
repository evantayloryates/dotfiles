// Explicit production qualification: tiny passive capture, owned metadata and
// one idle restart. Never grants permissions, takes focus or captures input.
// Usage: node installed-consumer-smoke.mjs ABSOLUTE_PRIVATE_OUTPUT [PRIOR_RUN] [PRIOR_EXPORT_RUN]
// PRIOR_RUN resumes its finished canary; it never schedules another take.
// PRIOR_EXPORT_RUN observes its already-issued restart and reuses its export.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { call } from '../lib/client.mjs';
import { prepareMaintenance, releaseMaintenance } from '../lib/maintenance.mjs';

const output=process.argv[2];
assert(output && isAbsolute(output), 'Supply a private absolute output directory');
const prior=process.argv[3];assert(!prior||isAbsolute(prior),'Resume path must be absolute');
const priorExport=process.argv[4];assert(!priorExport||(prior&&isAbsolute(priorExport)),'Export recovery requires the original canary and an absolute path');
mkdirSync(output,{recursive:false,mode:0o700});
const save=(name,value)=>writeFileSync(resolve(output,name+'.json'),JSON.stringify(value,null,2)+'\n',{mode:0o600});
const server=fileURLToPath(new URL('../server.mjs',import.meta.url));
const cli=fileURLToPath(new URL('../cli.mjs',import.meta.url));
const child=spawn(process.execPath,[server],{stdio:['pipe','pipe','pipe']});
let stderr=''; child.stderr.on('data',b=>{stderr+=b});
const pending=new Map(); let serial=0;
const rejectAll=error=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(error)}pending.clear()};
const lines=createInterface({input:child.stdout});
lines.on('line',line=>{
  const row=JSON.parse(line),p=pending.get(row.id);
  if(p){clearTimeout(p.timer);pending.delete(row.id);row.error?p.reject(new Error(JSON.stringify(row.error))):p.resolve(row.result)}
});
child.on('error',rejectAll);child.on('exit',()=>rejectAll(new Error('Owned MCP server exited')));
function request(method,params,timeout=30000){return new Promise((resolve,reject)=>{
  const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(new Error(method+' deadline'))},timeout);
  pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');
})}
async function tool(name,args={},artifact=name){
  const raw=await request('tools/call',{name,arguments:args});save(artifact,raw);
  assert(!raw.isError,JSON.stringify(raw.content));
  return JSON.parse(raw.content.find(x=>x.type==='text').text);
}
function runRestart(){return new Promise((finish,reject)=>{
  const p=spawn(process.execPath,[cli,'restart'],{stdio:['ignore','pipe','pipe']});let stdout='',err='';
  p.stdout.on('data',b=>{stdout+=b});p.stderr.on('data',b=>{err+=b});
  const timer=setTimeout(()=>p.kill('SIGTERM'),30000);
  p.on('error',reject);p.on('exit',code=>{clearTimeout(timer);writeFileSync(resolve(output,'restart.stderr'),err,{mode:0o600});writeFileSync(resolve(output,'restart.stdout'),stdout,{mode:0o600});code===0?finish(JSON.parse(stdout)):reject(new Error('Restart outcome uncertain; inspect retained stdout/stderr before any further action'))});
})}
let session,active;
try{
  save('initialize',await request('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'installed-qualification',version:'1'}}));
  const before=await tool('status',{},'before');assert.equal(before.capabilities.maintenance_fence,1);assert.equal(before.permission.screen_recording,'granted');
  let done;
  if(prior){
    const saved=name=>JSON.parse(JSON.parse(readFileSync(resolve(prior,name+'.json'),'utf8')).content.find(x=>x.type==='text').text);
    session=saved('session');done=saved('recording');assert.equal(done.state,'done');save('resume',{prior,session_id:session.session_id,recording_id:done.recording_id,capture_replayed:false});
  }else{
  session=await tool('session_open',{title:'Installed capture foundations qualification',purpose:'Owned passive canary; no UI or input; preserve evidence'},'session');
  const base={target:{type:'rect',x:0,y:34,w:16,h:16},session_id:session.session_id,input:{enabled:false},show_cursor:false,fps:10,max_width:32,codec:'h264'};
  const future=Date.now()+3600000;
  const scheduled=await tool('record_schedule',{...base,start_at:new Date(future).toISOString(),end_at:new Date(future+2000).toISOString(),idempotency_key:'installed-scheduled-'+session.session_id,label:'Owned future admission check'},'scheduled');
  active=scheduled.recording_id;
  await assert.rejects(()=>prepareMaintenance(call),e=>e.code==='maintenance_busy');save('scheduled-fence',{refused:true});
  await tool('record_stop',{recording_id:active,discard:true},'scheduled-cancel');active=undefined;
  const lease=await prepareMaintenance(call);
  try{await assert.rejects(()=>call('session.create',{title:'Must be refused under maintenance'}),e=>e.code==='maintenance_busy');save('admission-fence',{refused:true,pid:lease.pid})}
  finally{await releaseMaintenance(call,lease)}
  const start=Date.now()+2000;
  const recording=await tool('record_schedule',{...base,start_at:new Date(start).toISOString(),end_at:new Date(start+2000).toISOString(),idempotency_key:'installed-canary-'+session.session_id,label:'Tiny installed passive source canary'},'scheduled-canary');active=recording.recording_id;
  done=await tool('record_wait',{recording_id:active,timeout_s:20},'recording');assert.equal(done.state,'done');assert.equal(done.timed_out??false,false);active=undefined;
  }
  const source=await tool('recording_source',{recording_id:done.recording_id},'source');save('source-descriptor',source);assert.equal(source.source_packet.complete,true);assert.equal(source.source_packet.rows_lost,0);
  const exported=priorExport?JSON.parse(readFileSync(resolve(priorExport,'export-descriptor.json'),'utf8')):await tool('record_export',{recording_id:done.recording_id,effort:'draft',backend:'software',max_width:64,fps:10,from_s:0,to_s:1,name:'installed-source-draft.mp4'},'export');save('export-descriptor',exported);
  await tool('export_time_map',{recording_id:done.recording_id,name:'installed-source-draft.mp4',parent_relative_ns:['0','500000000','1000000000']},'time-map');
  const settled=await tool('status',{},'settled');assert.equal(settled.capture_health.recordings.unfinished,0);
  let restart;
  if(priorExport){
    const previous=JSON.parse(JSON.parse(readFileSync(resolve(priorExport,'before.json'),'utf8')).content.find(x=>x.type==='text').text);
    assert.notEqual(before.engine.pid,previous.engine.pid);assert.equal(before.engine.build,previous.engine.build);
    restart={...before,maintenance_mode:'fenced_observed_after_harness_failure',previous_pid:previous.engine.pid};save('restart-recovery',{priorExport,restart_replayed:false,same_mcp_reconnect_verified:false});
  }else{restart=await runRestart();assert.equal(restart.maintenance_mode,'fenced');assert.notEqual(restart.engine.pid,before.engine.pid);assert.equal(restart.engine.build,before.engine.build)}
  save('restart',restart);
  const recovered=await tool('status',{},priorExport?'recovered-new-mcp':'recovered-same-mcp');assert.equal(recovered.engine.pid,restart.engine.pid);assert.equal(recovered.permission.screen_recording,'granted');
  const retained=await tool('recordings',{recording_id:done.recording_id},'retained-recording');assert.equal(retained.state,'done');
  const retainedSource=await tool('recording_source',{recording_id:done.recording_id},'retained-source');assert.equal(retainedSource.source_packet.path,source.source_packet.path);
  await tool('session_update',{session_id:session.session_id,state:'closed'},'closed-session');
  save('summary',{passed:true,prior_pid:restart.previous_pid??before.engine.pid,restarted_pid:restart.engine.pid,build:restart.engine.build,same_mcp_reconnect_verified:!priorExport,restart_replayed:false,recording_id:done.recording_id,session_id:session.session_id,source_path:source.source_packet.path,video_path:done.video.path,export_path:exported.path,export_source:exported.derivative_source,limits:['Tiny passive region; no motion, menu, cursor, input, capacity or physical resource-release proof','Restart under launchd after idle fence; no forced rollback or cross-service lock',...(priorExport?['Original observer failed after restart; persistence verified through a fresh MCP server, same-server reconnect remains unverified']:[])]});
  console.log(JSON.stringify({passed:true,build:restart.engine.build,pid:restart.engine.pid,output}));
}catch(error){
  save('failure',{message:error.message,session_id:session?.session_id,owned_recording_id:active??null});
  // Preserve partial footage if our own admitted take is still live. No peers.
  if(active)await call('record.stop',{recording_id:active}).then(x=>save('owned-stop-after-failure',x)).catch(e=>save('owned-stop-error',{code:e.code,message:e.message}));
  throw error;
}finally{
  writeFileSync(resolve(output,'mcp.stderr'),stderr,{mode:0o600});
  child.stdin.end();lines.close();child.kill('SIGTERM');
  await new Promise(resolve=>{if(child.exitCode!==null||child.signalCode!==null)return resolve();child.once('exit',resolve)});
}
