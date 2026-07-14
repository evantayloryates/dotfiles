#!/usr/bin/env node
import fs from 'node:fs/promises';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
const tools=['search_emails','read_email','modify_email','list_email_labels'].map(name=>({name,inputSchema:{type:'object',additionalProperties:true}}));
const server=new Server({name:'fake-gmail',version:'1.0.0'},{capabilities:{tools:{}}});
server.setRequestHandler(ListToolsRequestSchema,async()=>({tools}));
server.setRequestHandler(CallToolRequestSchema,async(request)=>{const {name,arguments:args={}}=request.params;if(process.env.FAKE_GMAIL_LOG)await fs.appendFile(process.env.FAKE_GMAIL_LOG,`${name} ${JSON.stringify(args)}\n`);if(process.env.FAKE_GMAIL_FAIL===name)throw new Error(`forced ${name} failure`);if(process.env.FAKE_GMAIL_DELAY===name)await new Promise(r=>setTimeout(r,Number(process.env.FAKE_GMAIL_DELAY_MS||200)));let text='ok';if(name==='list_email_labels')text='Found 4 labels (2 system, 2 user):\n\nSystem Labels:\nID: INBOX\nName: INBOX\n\nID: UNREAD\nName: UNREAD\n\nUser Labels:\nID: Label_queue\nName: Ingest::Jobs\n\nID: Label_other\nName: Other';if(name==='search_emails')text='ID: msg-1\nSubject: New jobs\nFrom: LinkedIn Jobs\nDate: 2026-07-11T12:00:00Z\n\n--- 1 results.';if(name==='read_email')text='Staff Product Engineer\nExample Labs\nNew York, NY (Hybrid)\nView job: https://www.linkedin.com/jobs/view/12345/\n--------\nPrincipal Frontend Engineer\nOther Labs\nUnited States Remote\nView job: https://www.linkedin.com/jobs/view/67890/';return{content:[{type:'text',text}]};});
await server.connect(new StdioServerTransport());
