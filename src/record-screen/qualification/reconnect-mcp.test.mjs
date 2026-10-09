// Synthetic socket disconnect after request acceptance. No production/UI use.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtempSync,mkdirSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('read reconnects; accepted mutations disconnect once without replay', async()=>{
  const root=mkdtempSync(join(tmpdir(),'recorder-reconnect-'));mkdirSync(join(root,'run'));
  const counts=new Map(),sockets=new Set();let disconnectStatus=true;
  const fake=net.createServer(socket=>{
    sockets.add(socket);socket.on('close',()=>sockets.delete(socket));
    createInterface({input:socket}).on('line',line=>{
      const row=JSON.parse(line);counts.set(row.method,(counts.get(row.method)||0)+1);
      if(row.method==='status'&&!disconnectStatus){socket.write(JSON.stringify({id:row.id,result:{engine:{pid:200,build:'synthetic'},capabilities:{}}})+'\n');return}
      if(row.method==='status')disconnectStatus=false;
      socket.destroy(); // Accepted; reply lost, just as an engine exit can do.
    });
  });
  await new Promise((done,fail)=>{fake.once('error',fail);fake.listen(join(root,'run/engine.sock'),done)});
  const child=spawn(process.execPath,[fileURLToPath(new URL('../server.mjs',import.meta.url))],{env:{...process.env,RECORD_SCREEN_HOME:root},stdio:['pipe','pipe','pipe']});child.stderr.resume();
  const pending=new Map();let serial=0;
  const lines=createInterface({input:child.stdout});lines.on('line',line=>{
    const row=JSON.parse(line),p=pending.get(row.id);if(p){clearTimeout(p.timer);pending.delete(row.id);row.error?p.fail(new Error(JSON.stringify(row.error))):p.done(row.result)}
  });
  const request=(method,params)=>new Promise((done,fail)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);fail(new Error('deadline'))},5000);pending.set(id,{done,fail,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n')});
  try{
    await request('initialize',{protocolVersion:'2025-06-18'});
    const read=await request('tools/call',{name:'status',arguments:{}});assert.equal(read.isError,false);assert.equal(counts.get('status'),2);
    assert.equal(JSON.parse(read.content[0].text).mcp_adapter.replay_policy,1);
    for(const [name,method,args] of [
      ['session_open','session.create',{title:'Synthetic'}],
      ['record_schedule','record.schedule',{target:{type:'display'},session_id:'ses_synthetic',start_at:'2026-10-10T12:00:00Z',end_at:'2026-10-10T12:00:02Z',idempotency_key:'explicit-key'}],
      ['record_stop','record.stop',{recording_id:'rec_synthetic'}],
    ]){
      const result=await request('tools/call',{name,arguments:args});assert.equal(result.isError,true);assert.match(result.content[0].text,/engine_down|engine isn't running/);assert.equal(counts.get(method),1);
      // Same MCP process recovers with a read; no mutation is resubmitted.
      const recovered=await request('tools/call',{name:'status',arguments:{}});assert.equal(recovered.isError,false);assert.equal(counts.get(method),1);
    }
  }finally{
    child.stdin.end();child.kill('SIGTERM');lines.close();await new Promise(done=>{if(child.exitCode!==null||child.signalCode!==null)return done();child.once('exit',done)});
    for(const socket of sockets)socket.destroy();await new Promise(done=>fake.close(done));rmSync(root,{recursive:true,force:true});
  }
});
