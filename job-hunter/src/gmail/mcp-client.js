import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const REQUIRED=['search_emails','read_email','modify_email','list_email_labels'];
export class GmailMcpClient {
  constructor({command='/Users/taylor/dotfiles/gmail-mcp/run-gmail-mcp',args=['personal-primary'],env,startupTimeoutMs=30000,callTimeoutMs=20000}={}){this.command=command;this.args=args;this.env=env;this.startupTimeoutMs=startupTimeoutMs;this.callTimeoutMs=callTimeoutMs;this.client=null;this.transport=null;this.mutationChain=Promise.resolve();}
  async timeout(promise,ms,label){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} timed out after ${ms}ms`)),ms);})]);}finally{clearTimeout(timer);}}
  async connect(){this.transport=new StdioClientTransport({command:this.command,args:this.args,stderr:'pipe',...(this.env?{env:this.env}:{})});this.client=new Client({name:'job-hunter',version:'1.0.0'});await this.timeout(this.client.connect(this.transport),this.startupTimeoutMs,'Gmail MCP startup');const listed=await this.timeout(this.client.listTools(),this.callTimeoutMs,'Gmail MCP tools/list');const names=new Set((listed.tools||[]).map(t=>t.name));const missing=REQUIRED.filter(n=>!names.has(n));if(missing.length)throw new Error(`Gmail MCP is missing required tools: ${missing.join(', ')}`);return this;}
  async call(name,args={}){return this.timeout(this.client.callTool({name,arguments:args}),this.callTimeoutMs,`Gmail MCP ${name}`);}
  text(result){const block=result?.content?.find(x=>x.type==='text');if(!block)throw new Error('Gmail MCP returned no text content');return block.text;}
  async tool(name,args={}){return this.text(await this.call(name,args));}
  async mutate(name,args={}){const run=()=>this.tool(name,args);const next=this.mutationChain.then(run,run);this.mutationChain=next.catch(()=>{});return next;}
  async close(){if(this.client){await this.client.close();this.client=null;this.transport=null;}}
}
