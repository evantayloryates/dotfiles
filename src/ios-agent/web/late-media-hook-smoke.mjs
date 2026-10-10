// Targeted late-API and wrapper-replacement proof; never opens a microphone.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {Backend} from '../mcp/backend.mjs';
const {webkit}=createRequire('/Users/taylor/src/github/kickoff/next/package.json')('playwright');
const browser=await webkit.launch(),b=new Backend();let session;
const proof={at:new Date().toISOString(),scope:'Desktop WebKit controlled late API and later replacement; no physical media request',gates:{}};
try{
 const page=await browser.newPage();
 await page.addInitScript(()=>{Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:undefined}});});
 const grant=await b.webEnroll();await page.goto(JSON.parse(fs.readFileSync(grant.launchFile)).url);
 await page.waitForFunction(()=>window.__iosWebAgent?.status().connected);
 await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('synthetic','NotAllowedError')};});
 session=(await b.begin({surface:'web',page:await page.evaluate(()=>window.__iosWebAgent.status().page)})).sessionId;
 const run=(action,args={})=>b.webAction({sessionId:session,action,args});
 let state=await run('state');assert.equal(state.value.domains.media.hooks.microphoneAPIAtBoot,false);assert.equal(state.value.domains.media.hooks.microphone,true);proof.gates.lateAPIWrapped=true;
 const requested=await run('evaluate',{expression:'(async()=>{try{await navigator.mediaDevices.getUserMedia({audio:true});return {resolved:true}}catch(e){return {rejected:true,errorName:e.name}}})()'});proof.request=requested;assert(requested.ok);
 state=await run('state');assert.deepEqual(state.value.domains.media.requests,{pending:0,acquired:0,failed:1});proof.gates.rejectedRequestCounted=true;
 await page.evaluate(()=>{window.__runnerLaterGUM=async()=>new MediaStream();navigator.mediaDevices.getUserMedia=window.__runnerLaterGUM;});
 state=await run('state');assert.equal(state.value.domains.media.hooks.microphone,false);proof.gates.laterReplacementReported=true;
 await page.evaluate(()=>window.__iosWebAgent.stop());assert(await page.evaluate(()=>navigator.mediaDevices.getUserMedia===window.__runnerLaterGUM));proof.gates.laterReplacementPreserved=true;
 await b.end(session);session=null;proof.status='passed';
}finally{if(session)await b.end(session).catch(()=>{});await b.close();await browser.close();if(!proof.status)proof.status='failed';fs.writeFileSync(new URL('../docs/mobile-web-late-media-hook-2026-10-10.json',import.meta.url),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));}
