import fs from 'node:fs/promises';
import path from 'node:path';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { CONFIG_DIR, DATA_DIR } from './paths.js';
import { readJsonl } from './store/jsonl-store.js';

const FILE_SCHEMAS = { 'companies.jsonl': 'company', 'jobs.jsonl': 'job', 'postings.jsonl': 'posting', 'ingestion-runs.jsonl': 'ingestion-run', 'status-events.jsonl': 'status-event', 'dedupe-decisions.jsonl': 'dedupe-decision' };
export async function createValidators() {
  const ajv = new Ajv({ allErrors: true, strict: false }); addFormats(ajv);
  for (const name of Object.values(FILE_SCHEMAS)) ajv.addSchema(JSON.parse(await fs.readFile(path.join(CONFIG_DIR, 'schemas', `${name}.schema.json`), 'utf8')));
  return { ajv, validate: (name, record) => { const valid = ajv.validate(name, record); return { valid, errors: valid ? [] : (ajv.errors || []).map((e) => `${e.instancePath || '/'} ${e.message}`) }; } };
}

export async function validateStore(dataDir = DATA_DIR) {
  const { validate } = await createValidators(); const errors = []; const all = {};
  for (const [file, schema] of Object.entries(FILE_SCHEMAS)) {
    try { all[file] = await readJsonl(path.join(dataDir, file)); }
    catch (error) { errors.push(error.message); all[file] = []; continue; }
    const ids = new Set();
    all[file].forEach((record, i) => { const result = validate(schema, record); if (!result.valid) errors.push(`${file}:${i + 1}: ${result.errors.join('; ')}`); if (record.id && ids.has(record.id)) errors.push(`${file}:${i + 1}: duplicate id ${record.id}`); ids.add(record.id); });
  }
  const companyIds = new Set((all['companies.jsonl'] || []).map((r) => r.id));
  const jobIds = new Set((all['jobs.jsonl'] || []).map((r) => r.id));
  const postingIds = new Set((all['postings.jsonl'] || []).map((r) => r.id));
  for (const job of all['jobs.jsonl'] || []) { if (!companyIds.has(job.company_id)) errors.push(`job ${job.id} references missing company ${job.company_id}`); for (const id of job.posting_ids) if (!postingIds.has(id)) errors.push(`job ${job.id} references missing posting ${id}`); }
  for (const post of all['postings.jsonl'] || []) if (!jobIds.has(post.job_id)) errors.push(`posting ${post.id} references missing job ${post.job_id}`);
  for (const event of all['status-events.jsonl'] || []) if (!jobIds.has(event.job_id)) errors.push(`status event ${event.id} references missing job ${event.job_id}`);
  const events = [...(all['status-events.jsonl'] || [])].sort((a,b) => a.created_at.localeCompare(b.created_at));
  const state = new Map(); for (const e of events) { if (state.has(e.job_id) && state.get(e.job_id) !== e.from_status) errors.push(`status event ${e.id} chronology mismatch`); state.set(e.job_id, e.to_status); }
  return { valid: errors.length === 0, errors, counts: Object.fromEntries(Object.entries(all).map(([k,v]) => [k, v.length])) };
}
