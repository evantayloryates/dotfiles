export function findExactPosting(candidate, postings) {
  return postings.find((p) => p.id === candidate.posting_id || (p.source === candidate.source && ((candidate.source_external_id && p.source_external_id === candidate.source_external_id) || (candidate.canonical_url && p.canonical_url === candidate.canonical_url) || (candidate.apply_url && p.apply_url === candidate.apply_url)))) || null;
}
export function deterministicDecision(candidate, match) {
  const f = match.features;
  if (f.title_similarity >= .9 && f.description_similarity >= .65 && f.location_compatible) return { decision: 'same_job', confidence: Math.min(.99, .7 + f.title_similarity*.15 + f.description_similarity*.15), rationale: 'Near-identical title with strong description overlap and compatible location.' };
  if (f.title_similarity < .7 && f.description_similarity >= .8) return { decision: 'different_job', confidence: .9, rationale: 'Material title specialization differs despite shared boilerplate.' };
  if (f.title_similarity < .35 || f.location_compatible === false) return { decision: 'different_job', confidence: .95, rationale: 'Strong title or location conflict.' };
  return { decision: 'uncertain', confidence: match.score, rationale: 'Candidate requires bounded structured judgment.' };
}
