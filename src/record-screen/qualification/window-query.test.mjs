import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import net from 'node:net';
import {validateWindowQuery,requireTransientInventory} from '../lib/window-query.mjs';

test('window queries preserve legacy defaults and bound explicit discovery',()=>{
  const normal={app:'Finder',title:'fixture',on_screen_only:true,limit:1000};
  assert.equal(validateWindowQuery(normal),normal);
  assert.deepEqual(validateWindowQuery({}),{});
  for(const bad of [null,[],{app:3},{title:'x'.repeat(257)},{limit:0},{limit:1001},{limit:1.2},{limit:NaN},{include_transients:'true'},{on_screen_only:0},{path:'/tmp/other'}])
    assert.throws(()=>validateWindowQuery(bad),e=>e.code==='bad_window_query');
});
test('explicit true or false requires a supporting native engine; defaults do not',()=>{
  requireTransientInventory({},{});
  for(const include_transients of [true,false]){
    assert.throws(()=>requireTransientInventory({capabilities:{}},{include_transients}),e=>e.code==='unsupported_transient_window_inventory');
    requireTransientInventory({capabilities:{transient_window_inventory:1}},{include_transients});
  }
});
test('fresh MCP refuses invalid/unsupported discovery before windows RPC and plans discovered floating IDs',async()=>{
  const root=mkdtempSync(join(tmpdir(),'window-query-'));mkdirSync(join(root,'run'));
  const methods=[],sockets=new Set();let capable=false;
  const floating={window_id:7,pid:33,app:'Finder',bundle_id:'com.apple.finder',title:'',layer:3,on_screen:true,frame:{x:1,y:1,w:816,h:849}};
  const fake=net.createServer(socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));createInterface({input:socket}).on('line',line=>{
    const r=JSON.parse(line);methods.push(r);
    const result=r.method==='status'?{clock:{wall:new Date().toISOString()},permission:{screen_recording:'granted'},engine:{build:'test',pid:1},capabilities:{source_journal:1,target_capture_options:1,...(capable?{transient_window_inventory:1}:{})}}:
      {windows:r.params.include_transients?[floating]:[],total:r.params.include_transients?1:0};
    socket.write(JSON.stringify({id:r.id,result})+'\n');
  });});
  await new Promise((resolve,reject)=>{fake.once('error',reject);fake.listen(join(root,'run/engine.sock'),resolve);});
  const child=spawn(process.execPath,[fileURLToPath(new URL('../server.mjs',import.meta.url))],{env:{...process.env,RECORD_SCREEN_HOME:root},stdio:['pipe','pipe','pipe']});child.stderr.resume();
  const exited=new Promise(resolve=>child.once('exit',code=>resolve(code))),pending=new Map();let id=0;
  const lines=createInterface({input:child.stdout});lines.on('line',line=>{const r=JSON.parse(line),p=pending.get(r.id);if(p){clearTimeout(p.timer);pending.delete(r.id);p.resolve(r.result);}});
  const rpc=(method,params)=>new Promise((resolve,reject)=>{const key=++id,timer=setTimeout(()=>reject(Error('Owned MCP deadline')),5000);pending.set(key,{resolve,reject,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:key,method,params})+'\n');});
  const tool=(name,args)=>rpc('tools/call',{name,arguments:args});
  try{
    await rpc('initialize',{protocolVersion:'2025-06-18'});
    let r=await tool('windows',{include_transients:'yes'});assert.equal(r.isError,true);assert.equal(methods.length,0);
    r=await tool('windows',{include_transients:true});assert.equal(r.isError,true);assert.deepEqual(methods.map(x=>x.method),['status']);
    methods.length=0;r=await tool('windows',{});assert.equal(r.isError,false);assert.deepEqual(methods.map(x=>x.method),['windows.list']);assert.deepEqual(methods[0].params,{});
    const request={target:{type:'window',window_id:7},mode:'background',activity:'passive_capture',duration_s:10};
    methods.length=0;r=await tool('production_plan',request);assert.equal(r.isError,false);assert.equal(JSON.parse(r.content[0].text).target_observation,null);assert.equal(methods.find(x=>x.method==='windows.list').params.include_transients,undefined);
    capable=true;methods.length=0;r=await tool('production_plan',request);assert.equal(r.isError,false);assert.equal(JSON.parse(r.content[0].text).target_observation.window_id,7);assert.equal(methods.find(x=>x.method==='windows.list').params.include_transients,true);
  }finally{
    child.stdin.end();assert.equal(await exited,0);lines.close();for(const p of pending.values())clearTimeout(p.timer);for(const s of sockets)s.destroy();await new Promise(resolve=>fake.close(resolve));rmSync(root,{recursive:true,force:true});
  }
});
