import fs from 'node:fs';import assert from 'node:assert/strict';import {Backend}from'../mcp/backend.mjs';
const wanted=process.argv[2]||'ios-safari';const b=new Backend();let session;
const evidence={at:new Date().toISOString(),browser:wanted,scope:'Physical iPhone, private HTTPS page-owned adapter; transport not yet independently proven off-LAN'};
try{const pages=await b.webPages();const target=pages.pages.find(p=>p.browser===wanted&&p.visible&&p.path==='/dev/ios-agent');assert(target,'intended physical browser must be visible');session=(await b.begin({surface:'web',page:target.id})).sessionId;
 const run=(action,args={})=>b.webAction({sessionId:session,action,args});const find=(s,label,tag)=>s.value.elements.find(e=>e.label===label&&(!tag||e.tag===tag));
 let s=await run('snapshot');assert(s.ok);const input=find(s,'Test draft','input');assert(input);
 assert((await run('fill',{snapshot:s.value.snapshot,target:input.id,text:'Runner physical browser qualification'})).ok);
 s=await run('snapshot');assert.equal(find(s,'Test draft','input').value,'Runner physical browser qualification');
 assert((await run('click',{snapshot:s.value.snapshot,target:find(s,'Save test draft','button').id})).ok);
 s=await run('snapshot');assert(find(s,'Saved: Runner physical browser qualification'));
 const stale=await run('click',{snapshot:'old',target:'1'});assert.equal(stale.ok,false);assert.equal(stale.error,'stale_snapshot');
 s=await run('snapshot');assert((await run('click',{snapshot:s.value.snapshot,target:find(s,'Emit test signals','button').id})).ok);
 const events=await run('events');assert(events.value.events.some(e=>e.kind==='console'&&e.level==='warn'));assert(events.value.events.some(e=>e.kind==='network'));
 s=await run('snapshot');assert((await run('scroll',{snapshot:s.value.snapshot,target:find(s,'Save after scrolling','button').id})).ok);
 s=await run('snapshot');assert(find(s,'Save after scrolling','button').inViewport);
 assert((await run('click',{snapshot:s.value.snapshot,target:find(s,'Save after scrolling','button').id})).ok);
 s=await run('snapshot');assert(find(s,'Saved: scrolled'));
 const state=await run('state');assert.equal(state.value.browser,wanted);assert.equal(state.value.secureContext,true);
 // No microphone acquisition: this pass leaves no permission dialog or track.
 const media=await run('evaluate',{expression:'({hasMediaDevices:!!navigator.mediaDevices?.getUserMedia,activeUserGesture:navigator.userActivation?.isActive})'});assert(media.ok);
 evidence.gates={realDOM:true,reactFormReadback:true,clickEffect:true,scrollAndHit:true,staleTargetRefused:true,consoleAndNetwork:true,secureContext:true,explicitDevEvaluation:true,trustedInput:false,microphoneAcquisition:false};
 const end=await b.webEnd(session);assert.equal(end.indicatorOff,true);session=null;evidence.gates.glowOffReadback=true;
 fs.writeFileSync(new URL(`../docs/mobile-web-${wanted}-smoke-2026-10-09.json`,import.meta.url),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
}finally{if(session)await b.webEnd(session);await b.close();}
