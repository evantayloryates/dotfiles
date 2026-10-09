// Real live dev page; browser operations go through the MCP backend adapter.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {Backend} from '../mcp/backend.mjs';
const require=createRequire('/Users/taylor/src/github/kickoff/next/package.json');
const {chromium,webkit}=require('playwright');
const evidence={at:new Date().toISOString(),scope:'Desktop engines over real private HTTPS, not physical iPhone',browsers:{}};
for (const [name,engine] of Object.entries({chromium,webkit})) {
 const b=new Backend(), browser=await engine.launch({headless:true});let session;
 try {
  const enrollment=await b.webEnroll({});assert.equal(enrollment.ok,true);
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.goto(JSON.parse(fs.readFileSync(enrollment.launchFile)).url);
  await page.waitForFunction(()=>window.__iosWebAgent?.status().connected,{},{timeout:15000});
  const pages=await b.webPages();const pageId=await page.evaluate(()=>window.__iosWebAgent.status().page);const target=pages.pages.find(p=>p.id===pageId&&p.visible);
  assert(target);session=(await b.begin({surface:'web',page:target.id})).sessionId;
  const run=(action,args={})=>b.webAction({sessionId:session,action,args});
  let s=await run('snapshot');assert(s.ok);const find=(s,label)=>s.value.elements.find(e=>e.label===label);
  let input=s.value.elements.find(e=>e.label==='Test draft'&&e.tag==='input');assert(input);
  assert((await run('fill',{snapshot:s.value.snapshot,target:input.id,text:'Runner web bridge qualification'})).ok);
  s=await run('snapshot');assert.equal(s.value.elements.find(e=>e.label==='Test draft'&&e.tag==='input').value,'Runner web bridge qualification');
  assert((await run('click',{snapshot:s.value.snapshot,target:find(s,'Save test draft').id})).ok);
  s=await run('snapshot');assert(find(s,'Saved: Runner web bridge qualification'));
  // Refuse changed/stale targeting; no input is resent.
  const stale=await run('click',{snapshot:'old',target:'1'});assert.equal(stale.ok,false);assert.equal(stale.error,'stale_snapshot');
  s=await run('snapshot');assert((await run('click',{snapshot:s.value.snapshot,target:find(s,'Emit test signals').id})).ok);
  const events=await run('events');assert(events.value.events.some(e=>e.kind==='console'&&e.level==='warn'));assert(events.value.events.some(e=>e.kind==='network'));
  assert(events.value.events.every(e=>!('message'in e)&&!('url'in e)&&!('body'in e)));
  const other=new Backend();try{await assert.rejects(()=>other.begin({surface:'web',page:target.id}));}finally{await other.close();}
  const end=await b.webEnd(session);assert.equal(end.indicatorOff,true);session=null;
  assert.equal(await page.evaluate(()=>window.__iosWebAgent.status().indicator),false);
  // Full navigation keeps tab enrollment, but ends the old document lease.
  session=(await b.begin({surface:'web',page:target.id})).sessionId;
  await page.reload();await page.waitForFunction(()=>window.__iosWebAgent?.status().connected);
  const ended=await b.webEnd(session);assert.equal(ended.indicatorOff,true);session=null;
  evidence.browsers[name]={dom:true,reactFormReadback:true,clickEffect:true,contentFreeSignals:true,staleTargetsRefused:true,secondOwnerRefused:true,explicitGlowOff:true,reloadReconnectAndRelease:true};
  console.log(name,'passed');
 } finally {if(session)await b.webEnd(session);await b.close();await browser.close();}
}
fs.writeFileSync(new URL('../docs/mobile-web-desktop-smoke-2026-10-09.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');
