import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {Backend} from '../mcp/backend.mjs';
const engines=createRequire('/Users/taylor/src/github/kickoff/next/package.json')('playwright');
const proof={at:new Date().toISOString(),scope:'Owned desktop Chromium/WebKit pages; physical iOS and call CPU/memory qualification are separate',engines:{}};
for(const name of ['chromium','webkit']){
 const browser=await engines[name].launch(),b=new Backend();let session;
 try{
  const link=await b.webEnroll();const page=await browser.newPage();
  await page.goto(JSON.parse(fs.readFileSync(link.launchFile)).url,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__iosWebAgent?.status().connected);
  const id=await page.evaluate(()=>window.__iosWebAgent.status().page);session=(await b.begin({surface:'web',page:id})).sessionId;
  const run=(action,args={})=>b.webAction({sessionId:session,action,args});
  const first=await run('state');assert(first.ok);const p=first.value.domains.performance;assert(p&&p.contentFree);assert(p.resources.observed>=1);assert(p.navigation);
  if(!p.memory.supported)assert.equal(p.memory.jsHeapBytes,null);
  if(!p.longTasks.supported)assert.equal(p.longTasks.count,null);
  // A new bounded workload verifies the observer's marginal signal, not just API presence.
  const before=p.longTasks.count;
  assert((await run('evaluate',{expression:'(()=>{window.__runnerPerformanceProbe=false;setTimeout(()=>{const until=performance.now()+85;while(performance.now()<until){};window.__runnerPerformanceProbe=true;},0);return {workloadScheduled:true}})()'})).ok);
  await page.waitForFunction(()=>window.__runnerPerformanceProbe===true);await page.waitForTimeout(200);await page.evaluate(()=>delete window.__runnerPerformanceProbe);
  const read=await run('state');assert(read.ok);const after=read.value.domains.performance;
  if(after.longTasks.supported){assert(after.longTasks.count>before,JSON.stringify({before,after:after.longTasks}));assert(after.longTasks.maxDurationMs>=50);}
  const data=JSON.stringify(after);assert(!/https?:|authorization|deviceId|attribution|entryName/.test(data));
  const end=await b.webEnd(session);session=null;assert.equal(end.indicatorOff,true);
  await page.evaluate(()=>window.__iosWebAgent.stop());assert.equal(await page.evaluate(()=>!!window.__iosWebAgent||!!document.querySelector('[data-ios-agent=indicator]')),false);
  proof.engines[name]={numericState:true,unsupportedMetricsRemainNull:true,contentFree:true,longTasksSupported:after.longTasks.supported,controlledLongTaskDetected:after.longTasks.supported?true:null,glowOff:true,adapterRemoved:true};
 }finally{if(session)await b.webEnd(session);await b.close();await browser.close();}
}
proof.status='passed';fs.writeFileSync(new URL('../docs/mobile-web-performance-2026-10-09.json',import.meta.url),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
