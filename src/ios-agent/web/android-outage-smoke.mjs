import fs from 'node:fs';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {Backend} from '../mcp/backend.mjs';
const {chromium}=createRequire('/Users/taylor/src/github/kickoff/next/package.json')('playwright');const port=process.argv[2];assert(/^\d{1,5}$/.test(port));const browser=await chromium.connectOverCDP('http://127.0.0.1:'+port,{timeout:10000}),b=new Backend();let page,session,cdp;
const proof={at:new Date().toISOString(),scope:'Physical Pixel Chrome; CDP simulates offline on one owned page. Not actual cellular, Wi-Fi, tailnet outage or iOS proof.',gates:{}};
try{
 page=await browser.contexts()[0].newPage();const e=await b.webEnroll();await page.goto(JSON.parse(fs.readFileSync(e.launchFile)).url,{waitUntil:'domcontentloaded',timeout:25000});await page.waitForFunction(()=>window.__iosWebAgent?.status().connected);
 const id=await page.evaluate(()=>window.__iosWebAgent.status().page);session=(await b.begin({surface:'web',page:id})).sessionId;await page.waitForFunction(()=>window.__iosWebAgent.status().indicator);
 cdp=await page.context().newCDPSession(page);await cdp.send('Network.enable');const start=Date.now();await cdp.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1});
 await page.waitForFunction(()=>!window.__iosWebAgent.status().indicator,{},{timeout:18000});proof.gates.pageWatchdogGlowOff=true;proof.watchdogObservedMs=Date.now()-start;
 // Broker timeout is an independent gate; SDK watchdog alone is not release.
 const deadline=Date.now()+21000;let retired=false;
 while(Date.now()<deadline){if(!(await b.status()).lease){retired=true;break;}await new Promise(r=>setTimeout(r,1000));}
 assert(retired);proof.gates.disconnectedOwnerRetired=true;await b.end(session);session=null;
 await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});await page.waitForFunction(()=>window.__iosWebAgent.status().connected,{},{timeout:15000});
 const returned=await page.evaluate(()=>window.__iosWebAgent.status().page);assert.equal(returned,id);proof.gates.sameEnrollmentRecovered=true;
 session=(await b.begin({surface:'web',page:id})).sessionId;const ready=await b.webVerify({sessionId:session,gate:'web-ready'});assert(ready.ok);proof.gates.freshOwnershipReady=true;
 const end=await b.webEnd(session);session=null;assert.equal(end.indicatorOff,true);proof.gates.finalGlowOff=true;proof.status='passed';
}catch(error){proof.status='failed';proof.failure='android_outage_gate_not_passed';throw error;}finally{
 if(cdp)await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1}).catch(()=>{});if(session)await b.webEnd(session).catch(()=>{});if(page)await page.close().catch(()=>{});await b.close();await browser.close();fs.writeFileSync(new URL('../docs/mobile-web-android-outage-2026-10-09.json',import.meta.url),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
}
