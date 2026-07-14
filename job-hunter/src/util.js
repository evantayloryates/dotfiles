import crypto from 'node:crypto';

export const nowIso = () => new Date().toISOString();
export const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(String(value)).digest('hex')}`;
export const stableId = (prefix, value) => `${prefix}_${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 20)}`;
export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const cleanText = (value = '') => String(value).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
export const normalizeWords = (value = '') => cleanText(value).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();
export async function fetchJson(url, { timeoutMs = 15000, retries = 2, headers = {} } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal, headers: { 'user-agent': 'job-hunter/1.0 (+local personal job research)', accept: 'application/json', ...headers } });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt)));
    } finally { clearTimeout(timer); }
  }
  throw lastError;
}
