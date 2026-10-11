// Local transport fixture: real MCP/backend ownership and cleanup, no phone IPC.
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Backend} from '../mcp/backend.mjs';
import {createServer} from '../mcp/server.mjs';
import {StdioServerTransport} from '../mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/server/stdio.js';
const file=process.argv[2],connection=randomUUID();
const save=x=>fs.appendFileSync(file,JSON.stringify({connection,...x})+'\n',{mode:0o600});
class FixtureBackend extends Backend {
 constructor(){super({state:path.join(path.dirname(file),'state'),run:async(kind,args)=>{
  if(kind!=='cli'||!['acquire','release'].includes(args[0]))throw Error('fixture_ipc_only');
  save({kind:args[0]});
  if(args[0]==='acquire')fs.writeFileSync(args[args.indexOf('--lease-file')+1],'{}',{mode:0o600});
  return {ok:true,value:{}};
 }});}
 async begin(args){const value=await super.begin({...args,surface:'launch'});save({kind:'begin',owner:args.claudeOwner,id:value.sessionId});return value;}
 async harnessEnd(args){const value=await super.harnessEnd(args);save({kind:'end',args,cleanup:value.cleanup});return value;}
}
const backend=new FixtureBackend(),{server}=createServer(backend),transport=new StdioServerTransport();
let ending;
const finish=()=>ending??=(async()=>{await backend.close();save({kind:'closed',remaining:backend.sessions.size});await server.close();})();
await server.connect(transport);
process.stdin.on('end',()=>{void finish();});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{void finish().finally(()=>process.exit(0));});
