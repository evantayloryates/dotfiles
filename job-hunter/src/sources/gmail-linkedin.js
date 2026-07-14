import { GmailMcpClient } from '../gmail/mcp-client.js';
import { labelPlan } from '../gmail/labels.js';
import { parseSearch, classifyMessage, extractLinkedInCandidates } from '../gmail/messages.js';
import { sha256 } from '../util.js';

export async function fetchGmailCandidates({batch=10,dryRun=false,clientOptions={}}={}) {
  const client=await new GmailMcpClient(clientOptions).connect();
  const ackIds=[]; const records=[];
  try {
    const plan=labelPlan(await client.tool('list_email_labels'));
    let pageToken=null; const found=[];
    do {
      const text=await client.tool('search_emails',{query:'label:Ingest::Jobs',maxResults:Math.max(1,Math.min(100,batch-found.length)),...(pageToken?{pageToken}:{})});
      const parsed=parseSearch(text); found.push(...parsed.messages); pageToken=parsed.nextPageToken;
    } while(pageToken&&found.length<batch);
    const candidates=[];
    for(const message of found.slice(0,batch)) {
      if(!dryRun) await client.mutate('modify_email',{messageId:message.id,removeLabelIds:plan.cleanupLabelIds});
      let body;
      try { body=await client.tool('read_email',{messageId:message.id}); } catch { continue; }
      const classification=classifyMessage({subject:message.subject,from:message.from,body});
      records.push({message_id:message.id,content_hash:sha256(body),classification});
      if(classification==='parse_error') continue;
      if(classification==='job_alert'||classification==='job_listing') candidates.push(...extractLinkedInCandidates({messageId:message.id,subject:message.subject,from:message.from,date:message.date,body}));
      ackIds.push(message.id);
    }
    return {candidates,session:{messageCount:found.length,ackCount:ackIds.length,records,acknowledgeDurable:async()=>{if(!dryRun)for(const id of ackIds)await client.mutate('modify_email',{messageId:id,removeLabelIds:[plan.queueLabelId]});},close:()=>client.close()}};
  } catch(error) { await client.close().catch(()=>{}); throw error; }
}
