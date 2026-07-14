const includesAny = (text, terms) => terms.some((term) => text.includes(term));
export function rankJob(job, profile, sourceKinds = []) {
  const text = `${job.title} ${job.description}`.toLowerCase(); let score = 0; const reasons = []; const flags = [];
  const salary = job.salary; let compensation_band = 'unknown';
  if (salary.base_max != null && salary.base_max < profile.compensation.hard_floor) { compensation_band = 'below_floor'; flags.push('compensation_below_floor'); }
  else if (salary.base_max != null && salary.base_max >= profile.compensation.target) { compensation_band = 'target_or_above'; score += profile.weights.compensation; reasons.push('base compensation reaches target'); }
  else if (salary.base_max != null && salary.base_max >= profile.compensation.hard_floor) { compensation_band = 'meets_floor'; score += Math.round(profile.weights.compensation * .7); reasons.push('base compensation meets floor'); }
  else { flags.push('needs_compensation_review'); score += Math.round(profile.weights.compensation * .25); reasons.push('compensation needs verification'); }
  if (includesAny(text, profile.preferred_role_terms)) { score += profile.weights.role_level; reasons.push('preferred seniority'); }
  if (includesAny(text, profile.product_ui_terms)) { score += profile.weights.product_ui; reasons.push('product/UI ownership'); }
  if (includesAny(text, profile.ai_terms)) { score += profile.weights.ai_workflows; reasons.push('AI or agentic work'); }
  const loc = job.location; if (loc.city === 'New York' && loc.workplace_type === 'hybrid') { score += profile.weights.location; reasons.push('NYC hybrid'); } else if (loc.city === 'New York') { score += Math.round(profile.weights.location * .8); reasons.push('NYC'); } else if (loc.country === 'US' && loc.workplace_type === 'remote') { score += Math.round(profile.weights.location * .6); reasons.push('U.S. remote'); }
  if (includesAny(text, profile.creative_adtech_terms)) { score += profile.weights.creative_adtech; reasons.push('creative/video/adtech relevance'); }
  if (sourceKinds.some((s) => ['greenhouse','lever','ashby'].includes(s))) { score += profile.weights.freshness_direct; reasons.push('direct employer source'); }
  for (const signal of profile.negative_signals) if (text.includes(signal)) { score -= 10; flags.push(signal.replace(/\s+/g, '_')); }
  if (compensation_band === 'below_floor') score = Math.min(score, 25);
  return { score: Math.max(0, Math.min(100, score)), compensation_band, reasons, flags };
}
