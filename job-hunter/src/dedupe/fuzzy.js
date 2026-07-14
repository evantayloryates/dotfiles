import { normalizeWords } from '../util.js';
const tokens = (value) => new Set(normalizeWords(value).split(' ').filter(Boolean));
export function jaccard(a, b) { const aa = tokens(a), bb = tokens(b); if (!aa.size && !bb.size) return 1; const hit = [...aa].filter((x) => bb.has(x)).length; return hit / new Set([...aa, ...bb]).size; }
export function descriptionSimilarity(a, b) { const shingles = (v) => { const t = normalizeWords(v).split(' '); return new Set(t.slice(0,-2).map((_,i) => t.slice(i,i+3).join(' '))); }; const aa=shingles(a),bb=shingles(b); if (!aa.size || !bb.size) return 0; return [...aa].filter(x=>bb.has(x)).length / Math.min(aa.size,bb.size); }
