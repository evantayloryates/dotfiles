import fs from 'node:fs/promises';
import { atomicWrite } from './atomic-write.js';

export async function readJsonl(filePath, { missingOk = true } = {}) {
  let text;
  try { text = await fs.readFile(filePath, 'utf8'); }
  catch (error) { if (missingOk && error.code === 'ENOENT') return []; throw error; }
  const records = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try { records.push(JSON.parse(line)); }
    catch (error) { throw new Error(`${filePath}:${index + 1}: malformed JSON: ${error.message}`); }
  }
  return records;
}

export async function writeJsonl(filePath, records, options = {}) {
  const text = records.length ? `${records.map((record) => JSON.stringify(record)).join('\n')}\n` : '';
  await atomicWrite(filePath, text, options);
}

export async function readJson(filePath, fallback = {}) {
  try { return JSON.parse(await fs.readFile(filePath, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return structuredClone(fallback); throw error; }
}

export async function writeJson(filePath, value) { await atomicWrite(filePath, `${JSON.stringify(value, null, 2)}\n`); }
