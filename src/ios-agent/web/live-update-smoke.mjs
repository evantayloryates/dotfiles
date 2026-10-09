import fs from'node:fs';import assert from'node:assert/strict';import {Backend}from'../mcp/backend.mjs';
const file='/Users/taylor/src/github/kickoff/next/pages/dev/ios-agent.js';const original=fs.readFileSync(file,'utf8');const b=new Backend();let session,edited;const wanted=process.argv[2]||'ios-chrome';
const atomicWrite=value=>{const temp=file+'.runner-live-update';try{fs.writeFileSync(temp,value,{flag:'wx',mode:fs.statSync(file).mode&0o777});fs.renameSync(temp,file)}finally{fs.rmSync(temp,{force:true})}};
try{const pages=await b.webPages();const p=pages.pages.find(p=>p.browser===wanted&&p.visible&&p.path==='/dev/ios-agent');assert(p);session=(await b.begin({surface:'web',page:p.id})).sessionId;
 const run=(action,args={})=>b.webAction({sessionId:session,action,args});let s=await run('snapshot');const input=s.value.elements.find(e=>e.tag==='input');assert(input);
 assert((await run('fill',{snapshot:s.value.snapshot,target:input.id,text:'State survives mobile live update'})).ok);
 edited=original.replace('iPhone browser qualification</h1>','iPhone browser qualification · live update</h1>');assert.notEqual(edited,original);assert.equal(fs.readFileSync(file,'utf8'),original);atomicWrite(edited);
 let qualified=false;
 for(let i=0;i<6;i++){s=await run('snapshot');if(s.ok&&s.value.content.includes('· live update')){qualified=true;break;}await new Promise(r=>setTimeout(r,500));}
 assert(qualified,'actual phone must render edited code');assert.equal(s.value.path,'/dev/ios-agent');assert.equal(s.value.elements.find(e=>e.tag==='input').value,'State survives mobile live update');
 const gate=await b.webVerify({sessionId:session,gate:'web-route',expectedPath:'/dev/ios-agent',expectedText:'· live update'});assert(gate.ok);
 atomicWrite(original);edited=null;
 for(let i=0;i<6;i++){s=await run('snapshot');if(s.ok&&!s.value.content.includes('· live update'))break;await new Promise(r=>setTimeout(r,500));}
 assert(!s.value.content.includes('· live update'));assert.equal(s.value.elements.find(e=>e.tag==='input').value,'State survives mobile live update');
 const end=await b.webEnd(session);assert.equal(end.indicatorOff,true);session=null;
 fs.writeFileSync(new URL(`../docs/mobile-web-live-update-${wanted}-2026-10-09.json`,import.meta.url),JSON.stringify({at:new Date().toISOString(),scope:`Physical iPhone ${wanted} on private HTTPS; atomic Mac source write; no in-container touch; off-LAN not asserted`,gates:{codeEditRendered:true,routePreserved:true,formStatePreserved:true,sourceRestored:true,restoreRendered:true,glowOff:true}},null,2)+'\n');console.log(wanted,'live update and source restoration passed');
}finally{if(edited){assert.equal(fs.readFileSync(file,'utf8'),edited,'do not overwrite concurrent source edits');atomicWrite(original);}if(session)await b.webEnd(session);await b.close();}
