// Qualify pending/success/failure accounting without opening a microphone.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {Backend} from '../mcp/backend.mjs';
const {webkit}=createRequire('/Users/taylor/src/github/kickoff/next/package.json')('playwright');
const b=new Backend(), browser=await webkit.launch();let session;
const proof={at:new Date().toISOString(),scope:'Desktop WebKit, controlled media promise; no physical microphone acquisition'};
try{
 const page=await browser.newPage();
 await page.addInitScript(()=>{navigator.mediaDevices.getUserMedia=()=>new Promise((resolve,reject)=>{window.__runnerResolve=()=>resolve(new MediaStream());window.__runnerReject=()=>reject(new DOMException('synthetic','NotAllowedError'));});});
 const enrollment=await b.webEnroll();await page.goto(JSON.parse(fs.readFileSync(enrollment.launchFile)).url);
 await page.waitForFunction(()=>window.__iosWebAgent?.status().connected);
 const id=await page.evaluate(()=>window.__iosWebAgent.status().page);session=(await b.begin({surface:'web',page:id})).sessionId;
 const run=(action,args={})=>b.webAction({sessionId:session,action,args});
 const request=()=>run('evaluate',{expression:'window.__runnerRequest=navigator.mediaDevices.getUserMedia({audio:true}).catch(()=>null);true'});
 assert((await request()).ok);let state=await run('state');assert.equal(state.value.domains.media.requests.pending,1);
 assert((await run('evaluate',{expression:'window.__runnerResolve();true'})).ok);
 state=await run('state');assert.deepEqual(state.value.domains.media.requests,{pending:0,acquired:1,failed:0});
 assert((await request()).ok);assert((await run('evaluate',{expression:'window.__runnerReject();true'})).ok);
 state=await run('state');assert.deepEqual(state.value.domains.media.requests,{pending:0,acquired:1,failed:1});
 const events=await run('events');assert(events.value.events.some(e=>e.kind==='media'&&e.code==='requested'));assert(events.value.events.filter(e=>e.kind==='media').every(e=>!('message' in e)&&!('deviceId' in e)));
 const end=await b.webEnd(session);assert(end.indicatorOff);session=null;
 proof.gates={pendingRequestDistinguished:true,resolvedRequestCounted:true,rejectedRequestCounted:true,contentFreeEvents:true,glowOff:true};
 fs.writeFileSync(new URL('../docs/mobile-web-media-request-2026-10-09.json',import.meta.url),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
}finally{if(session)await b.webEnd(session);await b.close();await browser.close();}
