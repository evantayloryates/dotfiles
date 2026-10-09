import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {Backend,defaultState} from '../mcp/backend.mjs';
const {chromium}=createRequire('/Users/taylor/src/github/kickoff/next/package.json')('playwright');
const port=process.argv[2];assert(/^\d{1,5}$/.test(port));
const browser=await chromium.connectOverCDP('http://127.0.0.1:'+port,{timeout:10000}),b=new Backend();let page,session;
const proof={at:new Date().toISOString(),scope:'Physical Pixel Chrome, one task-owned tab; CDP over existing USB developer channel only for provisioning/oracle. MCP page actions use private HTTPS; off-LAN and iOS are not asserted.',gates:{}};
try{
 page=await browser.contexts()[0].newPage();
 const origin=new URL(JSON.parse(fs.readFileSync(defaultState+'/dev-runtime.json')).webURL).origin;
 // No grant until a plain navigation demonstrates correct route and TLS.
 await page.goto(origin+'/dev/ios-agent',{waitUntil:'domcontentloaded',timeout:25000});
 assert(await page.locator('h1').innerText()==='iPhone browser qualification');
 assert(await page.evaluate(()=>isSecureContext&&/Android/.test(navigator.userAgent)));
 proof.gates.plainPrivateHTTPSRoute=true;
 const enrollment=await b.webEnroll();await page.goto(JSON.parse(fs.readFileSync(enrollment.launchFile)).url,{waitUntil:'domcontentloaded',timeout:25000});
 await page.waitForFunction(()=>window.__iosWebAgent?.status().connected,{},{timeout:15000});
 const id=await page.evaluate(()=>window.__iosWebAgent.status().page);
 session=(await b.begin({surface:'web',page:id})).sessionId;const run=(action,args={})=>b.webAction({sessionId:session,action,args});
 let snap=await run('snapshot');assert(snap.ok);const input=snap.value.elements.find(e=>e.tag==='input'&&e.label==='Test draft');assert(input);
 assert((await run('fill',{snapshot:snap.value.snapshot,target:input.id,text:'Android shared-driver qualification'})).ok);
 snap=await run('snapshot');assert.equal(snap.value.elements.find(e=>e.tag==='input').value,'Android shared-driver qualification');
 const button=snap.value.elements.find(e=>e.tag==='button'&&e.label==='Save test draft');assert((await run('click',{snapshot:snap.value.snapshot,target:button.id})).ok);
 snap=await run('snapshot');assert(snap.value.content.includes('Saved: Android shared-driver qualification'));
 proof.gates.reactInputAndReadback=true;
 const state=await run('state');assert(state.ok);assert.equal(state.value.browser,'android-chrome');assert(state.value.domains.performance?.contentFree);proof.gates.androidIdentityDistinct=true;proof.gates.numericPerformanceState=true;
 const stale=await run('click',{snapshot:'old',target:'1'});assert.equal(stale.error,'stale_snapshot');proof.gates.staleTargetRefused=true;
 const end=await b.webEnd(session);session=null;assert.equal(end.indicatorOff,true);proof.gates.glowOff=true;
 proof.gates.independentDOMAgreement=await page.locator('[role=status]').innerText()==='Saved: Android shared-driver qualification';assert(proof.gates.independentDOMAgreement);
 proof.status='passed';
}catch(error){proof.status='failed';proof.failure='physical_android_browser_gate_not_passed';throw error;}finally{
 if(session)await b.webEnd(session).catch(()=>{});if(page)await page.close().catch(()=>{});await b.close();await browser.close();
 fs.writeFileSync(new URL('../docs/mobile-web-android-shared-driver-2026-10-09.json',import.meta.url),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
}
