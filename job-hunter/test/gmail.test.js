import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GmailMcpClient } from '../src/gmail/mcp-client.js';
import { labelPlan } from '../src/gmail/labels.js';
import { classifyMessage, extractLinkedInCandidates } from '../src/gmail/messages.js';
import { fetchGmailCandidates } from '../src/sources/gmail-linkedin.js';

const fake=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'fixtures/fake-gmail-mcp.js');
const fakeOptions=()=>({command:process.execPath,args:[fake],env:{...process.env}});

test('label cleanup removes user/classification labels but preserves queue and unread',()=>{
  const p=labelPlan('System Labels:\nID: INBOX\nName: INBOX\nID: UNREAD\nName: UNREAD\nUser Labels:\nID: q\nName: Ingest::Jobs\nID: x\nName: Other');
  assert.deepEqual(p,{queueLabelId:'q',cleanupLabelIds:['x','INBOX']});
});

test('Gmail digest parsing yields multiple postings without storing the whole body',()=>{
  const body='Staff Engineer\nExample\nNYC Hybrid\nView job: https://www.linkedin.com/jobs/view/111/\n--------\nPrincipal Engineer\nOther\nRemote\nView job: https://www.linkedin.com/jobs/view/222/';
  assert.equal(classifyMessage({body}),'job_alert');
  const candidates=extractLinkedInCandidates({messageId:'m',subject:'Jobs',from:'LinkedIn',date:'2026-07-11T00:00:00Z',body});
  assert.equal(candidates.length,2);assert.equal(candidates[0].source_external_id,'111');assert.equal('body' in candidates[0],false);
});

test('fake MCP proves discovery, durable-before-ack ordering, and clean shutdown',async()=>{
  const d=await fs.mkdtemp(path.join(os.tmpdir(),'gmail-fake-')),log=path.join(d,'calls');process.env.FAKE_GMAIL_LOG=log;
  let result;
  try {
    result=await fetchGmailCandidates({clientOptions:fakeOptions()});assert.equal(result.candidates.length,2);
    let calls=await fs.readFile(log,'utf8');assert.match(calls,/removeLabelIds.*Label_other.*INBOX/);assert.doesNotMatch(calls,/removeLabelIds.*Label_queue/);
    await fs.writeFile(path.join(d,'durable'),'yes');await result.session.acknowledgeDurable();await result.session.close();result=null;
    calls=await fs.readFile(log,'utf8');assert.ok(calls.indexOf('Label_queue')>calls.indexOf('Label_other'));
  } finally {if(result)await result.session.close();delete process.env.FAKE_GMAIL_LOG;}
});

test('write failure simulation leaves queue acknowledgment unsent',async()=>{
  const d=await fs.mkdtemp(path.join(os.tmpdir(),'gmail-noack-')),log=path.join(d,'calls');process.env.FAKE_GMAIL_LOG=log;
  const result=await fetchGmailCandidates({clientOptions:fakeOptions()});await result.session.close();
  const calls=await fs.readFile(log,'utf8');assert.doesNotMatch(calls,/removeLabelIds.*Label_queue/);delete process.env.FAKE_GMAIL_LOG;
});

test('MCP timeout propagates and shutdown completes',async()=>{
  process.env.FAKE_GMAIL_DELAY='modify_email';process.env.FAKE_GMAIL_DELAY_MS='100';
  const client=await new GmailMcpClient({...fakeOptions(),callTimeoutMs:20}).connect();
  try {await assert.rejects(client.mutate('modify_email',{messageId:'x'}),/timed out/);} finally {await client.close();delete process.env.FAKE_GMAIL_DELAY;delete process.env.FAKE_GMAIL_DELAY_MS;}
});
