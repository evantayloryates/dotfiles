import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Backend} from '../mcp/backend.mjs';
const b=new Backend(); let session;
const proof={at:new Date().toISOString(),scope:'One physical Safari-to-Chrome private enrollment attempt through page execution; no developer channel or Mirroring',gates:{},replay:false};
try {
 const pages=await b.webPages();
 const source=pages.pages?.find(p=>p.browser==='ios-safari'&&p.path==='/dev/ios-agent'&&p.visible&&p.ready);
 assert(source,'visible ready Safari qualification page required');
 const enrollment=await b.webEnroll({path:'/dev/ios-agent'});assert(enrollment.ok);
 const url=new URL(JSON.parse(fs.readFileSync(enrollment.launchFile,'utf8')).url);assert.equal(url.protocol,'https:');const chromeURL=url.href.replace(/^https:/,'googlechromes:');assert.equal(new URL(chromeURL).protocol,'googlechromes:');
 session=(await b.begin({surface:'web',page:source.id})).sessionId;
 const result=await b.webAction({sessionId:session,action:'evaluate',args:{expression:`(()=>{location.href=${JSON.stringify(chromeURL)};return {requested:true}})()`}});
 proof.launch={acknowledged:result.ok,outcome:result.outcome};
 // An accepted or uncertain launch is never replayed. New page identity is the gate.
 const deadline=Date.now()+25000;let target;
 while(Date.now()<deadline){const state=await b.webPages();target=state.pages?.find(p=>p.browser==='ios-chrome'&&p.path==='/dev/ios-agent'&&p.visible&&p.ready);if(target)break;await new Promise(r=>setTimeout(r,1000));}
 proof.gates.newChromeVisibleReady=!!target;
 const release=await b.webEnd(session);session=null;proof.gates.sourceGlowOff=release.indicatorOff===true;
 if(target){session=(await b.begin({surface:'web',page:target.id})).sessionId;const check=await b.webVerify({sessionId:session,gate:'web-ready'});proof.gates.targetOwnedReady=check.ok;const end=await b.webEnd(session);session=null;proof.gates.targetGlowOff=end.indicatorOff===true;}
 const after=await b.webPages();proof.observation=after.pages?.map(p=>({browser:p.browser,path:p.path,visible:p.visible,ready:p.ready,indicator:p.indicator}));
 proof.status=proof.gates.newChromeVisibleReady&&proof.gates.targetOwnedReady&&proof.gates.targetGlowOff?'passed':'not-qualified';
 proof.limits='External-app confirmation and trusted activation are OS/browser concerns; no OS prompt or true touch control is claimed.';
}finally{if(session)await b.webEnd(session).catch(()=>{});await b.close();fs.writeFileSync(new URL('../docs/mobile-web-browser-handoff-2026-10-09.json',import.meta.url),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));}
