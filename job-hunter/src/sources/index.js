import { readJsonl, readJson } from '../store/jsonl-store.js';
import { CONFIG_DIR, dataPath } from '../paths.js';
import path from 'node:path';
import { fetchGreenhouse } from './greenhouse.js'; import { fetchLever } from './lever.js'; import { fetchAshby } from './ashby.js'; import { fetchHackerNews } from './hacker-news.js';

export async function sourceConfig(){ return readJson(path.join(CONFIG_DIR,'sources.json')); }
export async function watchlist(){ return readJsonl(path.join(CONFIG_DIR,'company-watchlist.jsonl')); }
async function fetchCompanies(companies,fn){const settled=await Promise.allSettled(companies.map(fn));return {candidates:settled.filter(x=>x.status==='fulfilled').flatMap(x=>x.value),errors:settled.filter(x=>x.status==='rejected').map(x=>x.reason?.message||String(x.reason))};}
export async function fetchSource(name,{cursors={},gmailBatch=10,dryRun=false}={}) { const companies=await watchlist(); if(name==='greenhouse') return fetchCompanies(companies.filter(c=>c.greenhouse_token),fetchGreenhouse); if(name==='lever') return fetchCompanies(companies.filter(c=>c.lever_site),fetchLever); if(name==='ashby') return fetchCompanies(companies.filter(c=>c.ashby_board),fetchAshby); if(name==='hacker_news') return fetchHackerNews({cursor:cursors[name]}); if(name==='linkedin_email') { const { fetchGmailCandidates }=await import('./gmail-linkedin.js'); return fetchGmailCandidates({batch:gmailBatch,dryRun}); } throw new Error(`Unknown or unavailable source ${name}`); }
export async function enabledSources(){ const cfg=await sourceConfig(); return cfg.sources.filter(s=>s.enabled).map(s=>s.source); }
export async function loadCursors(){ return readJson(dataPath('source-cursors.json'),{}); }
