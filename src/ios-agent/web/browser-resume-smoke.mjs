// Fresh MCP + real private-HTTPS document/new-tab bootstrap. No phone claim.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {Client} from '../mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {StdioClientTransport} from '../mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
const {webkit}=createRequire('/Users/taylor/src/github/kickoff/next/package.json')('playwright');
const client=new Client({name:'browser-resume-smoke',version:'1'}),browser=await webkit.launch();let session;
const proof={at:new Date().toISOString(),scope:'Fresh stdio MCP and owned desktop WebKit tabs over private HTTPS; not physical iOS or off-LAN',gates:{}};
const call=async(name,args={})=>{const r=await client.callTool({name,arguments:args});assert(!r.isError);return r.structuredContent;};
try{
 await client.connect(new StdioClientTransport({command:'/Users/taylor/dotfiles/bin/ios-agent-mcp',stderr:'pipe'}));await call('ios_guide');
 const tools=await client.listTools();assert(tools.tools.find(t=>t.name==='ios_web_enroll').inputSchema.properties.rememberBrowser);proof.gates.freshMCPRemembranceSchema=true;
 const grant=await call('ios_web_enroll',{rememberBrowser:true});const url=JSON.parse(fs.readFileSync(grant.launchFile)).url,plain=url.split('#')[0],context=await browser.newContext();
 const parent=await context.newPage();await parent.goto(url);await parent.waitForFunction(()=>window.__iosWebAgent?.status().connected);
 const original=await parent.evaluate(()=>({id:window.__iosWebAgent.status().page,expiry:JSON.parse(localStorage.getItem('ios-agent-browser-resume')).expiresAt}));
 const child=await context.newPage();await child.goto(plain);await child.waitForFunction(()=>window.__iosWebAgent?.status().connected);
 const replacement=await child.evaluate(()=>({id:window.__iosWebAgent.status().page,expiry:JSON.parse(localStorage.getItem('ios-agent-browser-resume')).expiresAt,noBrowserSecretInTab:!JSON.parse(sessionStorage.getItem('ios-agent-page')).browserResume}));
 assert.notEqual(original.id,replacement.id);assert.equal(original.expiry,replacement.expiry);assert(replacement.noBrowserSecretInTab);proof.gates.newTabWithoutGrant=true;proof.gates.independentTabIdentity=true;proof.gates.originalConsentExpiryPreserved=true;
 session=(await call('ios_web_begin',{page:replacement.id})).sessionId;const state=await call('ios_web_inspect',{sessionId:session,kind:'state'});assert(state.ok);const pages=await call('ios_web_pages');const found=pages.pages.find(p=>p.id===replacement.id);assert.equal(found.boot,state.value.boot);assert.equal(found.version,state.value.version);proof.gates.discoveryReportsCurrentBootAndSDK=true;
 const end=await call('ios_web_end',{sessionId:session});session=null;assert(end.indicatorOff);proof.gates.glowOff=true;
 await child.evaluate(()=>window.__iosWebAgent.stop());const third=await context.newPage();await third.goto(plain);await third.waitForLoadState('networkidle');assert.equal(await third.evaluate(()=>!!window.__iosWebAgent),false);proof.gates.stopClearsNewTabOptIn=true;proof.status='passed';
}finally{if(session)await call('ios_web_end',{sessionId:session}).catch(()=>{});await client.close();await browser.close();if(!proof.status)proof.status='failed';fs.writeFileSync(new URL('../docs/mobile-web-browser-resume-2026-10-10.json',import.meta.url),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));}
