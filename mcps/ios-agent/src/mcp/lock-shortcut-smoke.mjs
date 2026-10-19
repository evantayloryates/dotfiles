import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const client=new Client({name:'runner-lock-qualification',version:'1'});
const proof={at:new Date().toISOString(),scope:'Physical configured paired iPhone; fixed shortcut lock; no XCTest or credentials'};
try {
 await client.connect(new StdioClientTransport({command:'/Users/taylor/dotfiles/bin/ios-agent-mcp',stderr:'pipe'}));
 await client.callTool({name:'ios_guide',arguments:{}});
 const catalog=await client.listTools(); assert.equal(catalog.tools.length,27);
 const result=await client.callTool({name:'ios_device_lock',arguments:{}});
 assert(!result.isError); proof.result=result.structuredContent; assert(proof.result.lockedVerified);
 const status=await client.callTool({name:'ios_status',arguments:{}});
 assert.equal(status.structuredContent.leased,false);
 proof.catalogTools=27; proof.ownerReleased=true; proof.status='passed';
} finally {
 await client.close(); if(!proof.status)proof.status='failed';
 fs.writeFileSync(new URL('../../docs/annotation-lock-mcp-2026-10-10.json',import.meta.url),JSON.stringify(proof,null,2)+'\n');
 console.log(JSON.stringify(proof));
}
