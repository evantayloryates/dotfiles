import{test}from'node:test';import assert from'node:assert/strict';
import fs from'node:fs';import{mkdtempSync,writeFileSync,rmSync,fstatSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';import{spawnSync,spawn}from'node:child_process';
import{validateRegisteredFrame,selectRegisteredFrames,mapRegisteredFrame,registrationHealth}from'../lib/registered-frame.mjs';
import{withFrameSnapshots,mapRecordingFrames,frameMapHealth}from'../lib/frame-map.mjs';
const epoch=10000000000000001n,clock={kind:'recorder_process',id:'11111111-2222-3333-4444-555555555555'};
const request={primary_recording_id:'rec_primary',backup_recording_id:'rec_backup',primary_frame_index:1,anchors:[{id:'a',x:112,y:112,w:64,h:64},{id:'b',x:300,y:260,w:64,h:64}],verification_regions:[{id:'v',x:340,y:180,w:64,h:64}],desktop_regions:[{id:'roi',x:100,y:100,w:320,h:240}]};
function fixture(){return[true,false].map(primary=>{
 const id=primary?'rec_primary':'rec_backup',dims=primary?[160,120]:[640,480],matrix=primary?[.5,0,0,.5,-500,-500]:[1,0,0,1,0,0];
 const rows=[{kind:'header',schema:'record-screen-source/v1',recording_id:id,clock_domain:'CLOCK_UPTIME_RAW',epoch_host_ns:String(epoch),clock_instance:clock,target:{type:primary?'window':'rect',include_child_windows:true}},
 {kind:'geometry',segment:0,geometry:{source_pixels:dims,desktop_points_to_source_pixels:matrix,content_scale:primary?.5:1}}];
 for(let n=0;n<3;n++)rows.push({kind:'source_frame',source_frame:n,geometry_segment:0,pts_host_ns:String(epoch+BigInt(n)*100000000n)},{kind:'encoded_frame',source_frame:n,encoded_sequence:n,relative_ns:String(BigInt(n)*100000000n),accepted:true,held:null});
 rows.push({kind:'footer',complete:true,rows_lost:0});return{descriptor:{recording_id:id,state:'done',source_packet:{epoch_host_ns:String(epoch),clock_instance:clock,clock_continuity:{observed_gaps:0,sample_unbounded:false},complete:true,rows_lost:0}},rows,probe:{streams:[{time_base:'1/1000000000',width:dims[0],height:dims[1]}],packets:[0,1,2].map(n=>({pts:n*100000000,duration:100000000}))}};
})}
test('strict request excludes paths/affine/threshold overrides and dependent verification',()=>{
 for(const patch of [{path:'/tmp/test'},{primary_frame_index:-1},{max_content_delta_ns:'250000001'},{anchors:request.anchors.slice(0,1)},{verification_regions:[{...request.anchors[0],id:'v'}]},{verification_regions:[{...request.verification_regions[0],id:'a'}]},{primary_recording_id:'rec_backup'}])assert.throws(()=>validateRegisteredFrame({...request,...patch}));
});
test('selection retains guarded primary and chooses backup by held source content, not output packet time',()=>{
 const s=fixture();s[0].rows.find(r=>r.kind==='encoded_frame'&&r.encoded_sequence===2).source_frame=0;
 const out=selectRegisteredFrames(s,{...request,primary_frame_index:2});assert.equal(out.config.primary_index,2);assert.equal(out.config.backup_index,0);assert.equal(out.base.primary.transform_available,false);assert.equal(out.base.source_content_delta_ns,'0');
});
test('clock uncertainty, gaps, content age, missing references and fitted backup refuse before decoding',()=>{
 for(const kind of ['clock','continuity','age','missing','fitted']){
 const s=fixture();if(kind==='clock'){s[1].rows[0].clock_instance={...clock,id:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'};s[1].descriptor.source_packet.clock_instance=s[1].rows[0].clock_instance;}
 if(kind==='continuity')s[1].descriptor.source_packet.clock_continuity.observed_gaps=1;
 if(kind==='age')s[1].rows.find(r=>r.kind==='encoded_frame'&&r.encoded_sequence===1).source_frame=0;
 if(kind==='missing')s[0].rows=s[0].rows.filter(r=>!(r.kind==='source_frame'&&r.source_frame===1));
 if(kind==='fitted'){s[1].rows[0].target.type='window';s[1].rows[1].geometry.content_scale=.5;}
 const out=selectRegisteredFrames(s,request);assert.equal(out.result.state,'unavailable',kind);assert.equal(out.result.registered_desktop_to_primary_pixels,null,kind);
 }
});
function generated(root){
 fs.mkdirSync(join(root,'run'),{recursive:true});
 const python='/Users/taylor/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';
 const authored=spawnSync(python,['-c',`import numpy as np\nfrom PIL import Image,ImageFilter\nfrom pathlib import Path\np=Path(${JSON.stringify(root)})\na=Image.fromarray(np.random.default_rng(843).integers(0,256,(480,640,3),dtype=np.uint8)).filter(ImageFilter.GaussianBlur(1))\na.save(p/'backup.png')\nb=a.crop((100,100,420,340)).resize((160,120),Image.Resampling.BICUBIC)\nb.save(p/'primary.png')\nc=b.copy();c.paste((255,255,255),(120,40,152,72));c.save(p/'bad.png')`],{encoding:'utf8'});assert.equal(authored.status,0,authored.stderr);
 const snapshots=fixture();for(const[name,n]of [['primary',0],['backup',1],['bad',2]]){
 const result=spawnSync('/opt/homebrew/bin/ffmpeg',['-v','error','-loop','1','-framerate','10','-i',join(root,name+'.png'),'-frames:v','3','-c:v','libx264rgb','-crf','0','-pix_fmt','rgb24','-bf','0','-video_track_timescale','1000000000',join(root,name+'.mp4')],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
 if(n<2){const s=snapshots[n];s.descriptor.source_packet.path=join(root,name+'.jsonl');s.descriptor.video={path:join(root,name+'.mp4')};writeFileSync(s.descriptor.source_packet.path,s.rows.map(r=>JSON.stringify(r)).join('\n')+'\n');}}
 return{snapshots,python};
}
test('actual opened-frame decode verifies exact PTS and independent pixels; wrong held-out content refuses',async()=>{
 const root=mkdtempSync(join(tmpdir(),'registered-frame-'));const old={...process.env};
 try{const{snapshots:s,python}=generated(root);process.env.RECORD_SCREEN_HOME=root;process.env.RECORD_SCREEN_REGISTRATION_PYTHON=python;process.env.FFMPEG_PATH='/opt/homebrew/bin/ffmpeg';process.env.FFPROBE_PATH='/opt/homebrew/bin/ffprobe';
 const before=s.map(x=>fs.readFileSync(x.descriptor.video.path));const out=await mapRegisteredFrame(s[0].descriptor,s[1].descriptor,request);assert.equal(out.state,'available',JSON.stringify(out.image_registration));assert.equal(out.primary.transform_available,false);assert(out.image_registration.independent_verification.every(v=>v.verified));assert.equal(out.image_registration.decoded_frames[0].frame_time_ns.numerator,'100000000');assert.equal(out.desktop_regions[0].canvas_relation,'contained');
 const mux=spawnSync('/opt/homebrew/bin/ffmpeg',['-v','error','-i',s[0].descriptor.video.path,'-f','lavfi','-i','color=white:s=320x240:r=10','-map','0:v:0','-map','1:v:0','-c:v:0','copy','-c:v:1','libx264','-frames:v:1','3','-shortest',join(root,'multi.mkv')],{encoding:'utf8'});assert.equal(mux.status,0,mux.stderr);const multi=structuredClone(s[0].descriptor);multi.video.path=join(root,'multi.mkv');const selected=await mapRegisteredFrame(multi,s[1].descriptor,request);assert.equal(selected.state,'available','decoder must select probed v:0 even when another video stream is larger');
 const bad=structuredClone(s[0].descriptor);bad.video.path=join(root,'bad.mp4');const no=await mapRegisteredFrame(bad,s[1].descriptor,request);assert.equal(no.state,'unavailable');assert.equal(no.reason,'independent_verification_refused');assert.equal(no.registered_desktop_to_primary_pixels,null);assert.equal(no.image_registration.candidate.candidate_transform_available,true);
 assert(before.every((bytes,n)=>bytes.equals(fs.readFileSync(s[n].descriptor.video.path))));assert.equal(registrationHealth().worker,null);assert.equal(frameMapHealth().active,false);
 }finally{process.env=old;rmSync(root,{recursive:true,force:true})}
});
test('snapshot lease awaits async consumers, refuses concurrent read, detects late mutation and closes owned FDs',async()=>{
 const root=mkdtempSync(join(tmpdir(),'registered-snapshot-'));const old=process.env.FFPROBE_PATH;process.env.FFPROBE_PATH='/opt/homebrew/bin/ffprobe';
 try{const{snapshots:s}=generated(root);let release,entered;const ready=new Promise(r=>entered=r);const pending=withFrameSnapshots([s[0].descriptor],async(_,fds)=>{entered(fds[0]);await new Promise(r=>release=r);fs.appendFileSync(s[0].descriptor.source_packet.path,'\n');return{completed:true}});const fd=await ready;assert(fstatSync(fd).isFile());assert.equal(frameMapHealth().active,true);await assert.rejects(mapRecordingFrames(s[0].descriptor,{recording_id:'rec_primary',frame_indices:[0]}),e=>e.code==='frame_mapping_busy');release();await assert.rejects(pending,e=>e.code==='frame_mapping');assert.throws(()=>fstatSync(fd),e=>e.code==='EBADF');assert.equal(frameMapHealth().active,false);
 }finally{if(old===undefined)delete process.env.FFPROBE_PATH;else process.env.FFPROBE_PATH=old;rmSync(root,{recursive:true,force:true})}
});
test('worker response overflow kills only its owned process group and clears quarantine after close',async()=>{
 const root=mkdtempSync(join(tmpdir(),'registered-worker-')),old={...process.env};
 try{const{snapshots:s}=generated(root);const fake=join(root,'fake-python');writeFileSync(fake,`#!${process.execPath}\nprocess.stdout.write('x'.repeat(600000));setInterval(()=>{},1000);\n`,{mode:0o700});process.env.RECORD_SCREEN_REGISTRATION_PYTHON=fake;process.env.FFPROBE_PATH='/opt/homebrew/bin/ffprobe';
 await assert.rejects(mapRegisteredFrame(s[0].descriptor,s[1].descriptor,request),e=>e.code==='registration_worker');const until=Date.now()+3000;while(registrationHealth().worker&&Date.now()<until)await new Promise(r=>setTimeout(r,10));assert.equal(registrationHealth().worker,null);assert.equal(frameMapHealth().active,false);
 }finally{process.env=old;rmSync(root,{recursive:true,force:true})}
});
test('decoder rejects a selected frame whose actual rational PTS differs from the expected source identity',()=>{
 const root=mkdtempSync(join(tmpdir(),'registered-pts-'));
 try{const{snapshots:s,python}=generated(root);const code=`import importlib.util,os\ns=importlib.util.spec_from_file_location('worker',${JSON.stringify(new URL('../lib/registered-frame.py',import.meta.url).pathname)})\nm=importlib.util.module_from_spec(s);s.loader.exec_module(m)\nf=os.open(${JSON.stringify(s[0].descriptor.video.path)},os.O_RDONLY)\ntry:\n try:m.decode('/opt/homebrew/bin/ffmpeg',f,1,[160,120],{'numerator':'100000001','denominator':'1'})\n except ValueError as e:assert str(e)=='decoded_frame_timestamp_mismatch'\n else:raise AssertionError('wrong frame time accepted')\nfinally:os.close(f)`;const r=spawnSync(python,['-c',code],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
 }finally{rmSync(root,{recursive:true,force:true})}
});

test('kernel lease refuses a competing live owner and releases without stale PID or file polling',async()=>{
 const root=mkdtempSync(join(tmpdir(),'registered-lease-')),old={...process.env};let owner;
 try{const{snapshots:s,python}=generated(root);process.env.RECORD_SCREEN_HOME=root;process.env.RECORD_SCREEN_REGISTRATION_PYTHON=python;process.env.FFMPEG_PATH='/opt/homebrew/bin/ffmpeg';process.env.FFPROBE_PATH='/opt/homebrew/bin/ffprobe';
 owner=spawn(python,['-c',"import os,fcntl,sys;f=os.open(sys.argv[1],os.O_RDWR|os.O_CREAT,0o600);fcntl.flock(f,fcntl.LOCK_EX);print('READY',flush=True);sys.stdin.read();os.close(f)",join(root,'run/registration-reader.lock')],{stdio:['pipe','pipe','pipe']});owner.stderr.resume();const exit=new Promise(r=>owner.once('exit',r));await new Promise((resolve,reject)=>{owner.once('error',reject);owner.stdout.once('data',d=>String(d).includes('READY')?resolve():reject(Error('owner not ready')))});
 const busy=await mapRegisteredFrame(s[0].descriptor,s[1].descriptor,request);assert.equal(busy.reason,'registration_busy');assert.equal(busy.image_registration.decoded_frames,undefined);process.kill(owner.pid,0);owner.stdin.end();assert.equal(await exit,0);owner=null;const available=await mapRegisteredFrame(s[0].descriptor,s[1].descriptor,request);assert.equal(available.state,'available');assert.equal(registrationHealth().worker,null);
 }finally{if(owner)owner.kill('SIGKILL');process.env=old;rmSync(root,{recursive:true,force:true})}
});
