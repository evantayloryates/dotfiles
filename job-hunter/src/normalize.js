import { cleanText, normalizeWords, sha256, stableId, stableStringify } from './util.js';
import { parseSalary } from './salary.js';
import { normalizeLocation } from './locations.js';

export const normalizeCompanyName = normalizeWords;
export function normalizeDomain(value) { if (!value) return null; try { return new URL(value.includes('://') ? value : `https://${value}`).hostname.toLowerCase().replace(/^www\./, ''); } catch { return String(value).toLowerCase().replace(/^www\./, '').split('/')[0]; } }
export function normalizeUrl(value) {
  if (!value) return null;
  try { const u = new URL(value); if(/(^|\.)linkedin\.com$/i.test(u.hostname)&&/\/jobs\/view\//.test(u.pathname))u.search='';else for (const key of [...u.searchParams.keys()]) if (/^(utm_|trk|tracking|ref|source|mc_|li_fat_id)/i.test(key)) u.searchParams.delete(key); u.hash = ''; return u.toString().replace(/\/$/, ''); } catch { return value; }
}
export const normalizeTitle = normalizeWords;
export function sourceToCandidate(raw, seenAt = new Date().toISOString()) {
  const company = cleanText(raw.company || raw.company_name || 'Unknown company'); const title = cleanText(raw.title || 'Untitled role'); const description = cleanText(raw.description || raw.content || '');
  const sourceUrl = normalizeUrl(raw.source_url || raw.url); const canonicalUrl = normalizeUrl(raw.canonical_url); const applyUrl = normalizeUrl(raw.apply_url);
  const published = raw.published_at ? new Date(raw.published_at).toISOString() : seenAt;
  const identity = raw.source_external_id || canonicalUrl || applyUrl || sourceUrl || stableStringify({ company, title, location: raw.location, published });
  return { source: raw.source, source_external_id: raw.source_external_id == null ? null : String(raw.source_external_id), source_url: sourceUrl, canonical_url: canonicalUrl, apply_url: applyUrl, company, domain: normalizeDomain(raw.domain), title, description, location: normalizeLocation(raw.location, raw.workplace_type), salary: raw.salary && typeof raw.salary === 'object' ? raw.salary : parseSalary(raw.salary || raw.compensation), published_at: published, published_at_inferred: !raw.published_at, source_location: raw.location || null, source_salary_raw: raw.salary_raw || raw.salary || raw.compensation || null, raw_artifact_path: raw.raw_artifact_path || null, active: raw.active !== false, source_record_hash: sha256(stableStringify(raw)), posting_key: `${raw.source}:${identity}`, posting_id: stableId('post', `${raw.source}:${identity}`) };
}
