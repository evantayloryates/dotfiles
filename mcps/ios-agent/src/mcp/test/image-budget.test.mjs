import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {Backend} from '../backend.mjs';import {createServer} from '../server.mjs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
test('oversized historical image gives a bounded error and leaves the MCP connection usable',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ios-image-budget-')),b=new Backend({state:dir});const id='a'.repeat(32),file=path.join(dir,'large.json');fs.writeFileSync(file,JSON.stringify({result:{pngBase64:'A'.repeat(8*1024*1024+4)}}));b.artifacts.set(id,{file,type:'image'});
 const {server}=createServer(b),[ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);const c=new Client({name:'image-budget',version:'1'});await c.connect(ct);
 try{const r=await c.callTool({name:'ios_read',arguments:{artifactId:id}});assert(r.isError);assert.equal(r.content[0].text,'image_transport_limit_capture_again');assert(!(await c.callTool({name:'ios_audio_probe',arguments:{action:'plan'}})).isError);}
 finally{await c.close();await server.close();await b.close();fs.rmSync(dir,{recursive:true,force:true});}
});
