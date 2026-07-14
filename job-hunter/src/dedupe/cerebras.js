import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from '../paths.js';

const responseSchema = { type:'object', additionalProperties:false, required:['decision','confidence','canonical_job_id','signals_for','signals_against','reason'], properties:{ decision:{enum:['same_job','different_job','uncertain']}, confidence:{type:'number',minimum:0,maximum:1}, canonical_job_id:{type:['string','null']}, signals_for:{type:'array',items:{type:'string'}}, signals_against:{type:'array',items:{type:'string'}}, reason:{type:'string'} } };
export function validateCerebrasDecision(value, threshold = .9) {
  if (!value || !['same_job','different_job','uncertain'].includes(value.decision) || typeof value.confidence !== 'number' || !Array.isArray(value.signals_for) || !Array.isArray(value.signals_against) || typeof value.reason !== 'string') return { valid:false, merge:false, reason:'malformed response' };
  return { valid:true, merge:value.decision === 'same_job' && value.confidence >= threshold, reason:value.decision === 'uncertain' ? 'uncertain responses never merge' : value.confidence < threshold ? 'below confidence threshold' : value.reason };
}
export async function judgeWithCerebras(candidate, job, { token = process.env.CEREBRAS_TOKEN, threshold = .9, timeoutMs = 15000 } = {}) {
  if (!token) return { skipped:true, decision:'uncertain', confidence:0, reason:'CEREBRAS_TOKEN absent' };
  const system = await fs.readFile(path.join(ROOT, 'prompts/dedupe/system.txt'), 'utf8');
  const facts = { candidate:{company:candidate.company,title:candidate.title,location:candidate.location,salary:candidate.salary,published_at:candidate.published_at,description:candidate.description.slice(0,3500)}, canonical:{id:job.id,title:job.title,location:job.location,salary:job.salary,published_at:job.published_at,description:job.description.slice(0,3500)} };
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);let response;
  try { response = await fetch('https://api.cerebras.ai/v1/chat/completions',{method:'POST',signal:controller.signal,headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({model:'gpt-oss-120b',messages:[{role:'system',content:system},{role:'user',content:JSON.stringify(facts)}],response_format:{type:'json_schema',json_schema:{name:'job_dedupe',strict:true,schema:responseSchema}},prompt_cache_key:'job-hunter-dedupe-v1',temperature:0})}); } finally { clearTimeout(timer); }
  if (!response.ok) throw new Error(`Cerebras HTTP ${response.status}`); const payload=await response.json(); const value=JSON.parse(payload.choices[0].message.content); const check=validateCerebrasDecision(value,threshold); if (!check.valid) throw new Error(`Invalid Cerebras dedupe response: ${check.reason}`); return {...value,merge:check.merge,model:'gpt-oss-120b'};
}
