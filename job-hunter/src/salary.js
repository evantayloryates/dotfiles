const number = (raw) => { const text=String(raw); const n = Number(text.replace(/[$,\sk]/gi, '')); return /k/i.test(text) ? n * 1000 : n; };
export function parseSalary(raw) {
  if (!raw) return { currency: null, period: 'unknown', base_min: null, base_max: null, total_comp_min: null, total_comp_max: null, confidence: 'unknown', raw: null };
  const text = String(raw); const hourly = /(?:\/\s*h(?:ou)?r|per hour|hourly)/i.test(text); const total = /total comp|ote|equity|bonus/i.test(text) && !/base/i.test(text);
  const values = [...text.matchAll(/\$\s*[\d,.]+\s*[kK]?/g)].map((m) => number(m[0])).filter(Number.isFinite);
  if (!values.length) return { currency: /\$|USD/i.test(text) ? 'USD' : null, period: hourly ? 'hour' : 'unknown', base_min: null, base_max: null, total_comp_min: null, total_comp_max: null, confidence: 'unknown', raw: text };
  const min = Math.min(...values); const max = Math.max(...values);
  return { currency: /\$|USD/i.test(text) ? 'USD' : null, period: hourly ? 'hour' : 'year', base_min: total || hourly ? null : min, base_max: total || hourly ? null : max, total_comp_min: total ? min : null, total_comp_max: total ? max : null, confidence: total || hourly ? 'inferred' : 'explicit', raw: text };
}
