import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Client} from '../mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {StdioClientTransport} from '../mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
const wanted=process.argv[2]||'ios-chrome';
const client=new Client({name:'physical-element-inspection',version:'1'});
await client.connect(new StdioClientTransport({command:'/Users/taylor/dotfiles/bin/ios-agent-mcp',env:{HOME:process.env.HOME,PATH:'/usr/bin:/bin'},stderr:'pipe'}));
const call=async(name,args={})=>{const r=await client.callTool({name,arguments:args});assert(r.structuredContent,'structured MCP receipt required');return r.structuredContent;};
let session;
const proof={at:new Date().toISOString(),browser:wanted,scope:'Physical browser over private HTTPS; owned qualification input and temporary occluder. User confirms no USB. No physical off-LAN claim.',gates:{}};
try{
 await call('ios_guide');const catalog=await client.listTools();assert(catalog.tools.find(t=>t.name==='ios_web_inspect').inputSchema.properties.kind.enum.includes('element'));proof.gates.freshMCPDiscovery=true;
 const page=(await call('ios_web_pages')).pages.find(p=>p.browser===wanted&&p.ready&&p.visible&&p.path==='/dev/ios-agent');assert(page);
 session=(await call('ios_web_begin',{page:page.id})).sessionId;assert(session);
 // A source upgrade needs a full document reload; observe the replacement,
 // never replay an uncertain reload acknowledgment.
 if(process.argv.includes('--reload')){const reload=await call('ios_web_action',{sessionId:session,action:'evaluate',args:{expression:'location.reload();({reloadRequested:true})'}});proof.reloadOutcome=reload.outcome;
 await call('ios_web_end',{sessionId:session});session=null;
 let current;for(let i=0;i<10;i++){current=(await call('ios_web_pages')).pages.find(p=>p.id===page.id&&p.visible&&p.ready);if(current)break;await new Promise(r=>setTimeout(r,500));}assert(current);
 session=(await call('ios_web_begin',{page:current.id})).sessionId;}
 const state=await call('ios_web_inspect',{sessionId:session,kind:'state'});proof.sdk=state.value.version;assert.equal(state.value.browser,wanted);assert(state.value.domains.performance);proof.gates.physicalPerformanceAvailable=true;
 const inspect=()=>call('ios_web_inspect',{sessionId:session,kind:'snapshot',selector:'#draft'});
 let snap=await inspect();let target=snap.value.elements.find(e=>e.tag==='input');assert(target);
 const details=await call('ios_web_inspect',{sessionId:session,kind:'element',snapshot:snap.value.snapshot,target:target.id});assert(details.ok&&details.value.interactable);assert.equal(details.value.target.tag,'input');assert.equal(details.value.computed.fontSize,'18px');proof.gates.computedCSSAndHitReadback=true;
 assert((await call('ios_web_action',{sessionId:session,action:'evaluate',args:{expression:"(()=>{const r=document.querySelector('#draft').getBoundingClientRect(),e=document.createElement('div');e.id='runner-owned-occluder';e.setAttribute('aria-hidden','true');e.style.cssText='position:fixed;z-index:2147483646;pointer-events:auto;';Object.assign(e.style,{left:r.x+'px',top:r.y+'px',width:r.width+'px',height:r.height+'px'});document.body.append(e);setTimeout(()=>e.remove(),10000);return true})()"}})).ok);
 snap=await inspect();target=snap.value.elements.find(e=>e.tag==='input');
 const covered=await call('ios_web_inspect',{sessionId:session,kind:'element',snapshot:snap.value.snapshot,target:target.id});assert(covered.ok);assert.equal(covered.value.interactable,false);assert.equal(covered.value.centerHit.tag,'div');proof.gates.actualOccluderExplained=true;
 const stale=await call('ios_web_inspect',{sessionId:session,kind:'element',snapshot:'old',target:target.id});assert.equal(stale.error,'stale_snapshot');proof.gates.staleInspectionRefused=true;
 assert((await call('ios_web_action',{sessionId:session,action:'evaluate',args:{expression:"document.getElementById('runner-owned-occluder')?.remove();true"}})).ok);
 const ended=await call('ios_web_end',{sessionId:session});session=null;assert.equal(ended.indicatorOff,true);proof.gates.occluderRemovedAndGlowOff=true;proof.status='passed';
}finally{
 if(session){await call('ios_web_action',{sessionId:session,action:'evaluate',args:{expression:"document.getElementById('runner-owned-occluder')?.remove();true"}}).catch(()=>{});await call('ios_web_end',{sessionId:session}).catch(()=>{});}
 await client.close();if(!proof.status)proof.status='failed';fs.writeFileSync(new URL('../docs/mobile-web-element-'+wanted+'-2026-10-10.json',import.meta.url),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
}
