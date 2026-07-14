import { jaccard, descriptionSimilarity } from './fuzzy.js';
export function retrieveCandidates(candidate, jobs, limit = 5) {
  return jobs.filter((j) => j.company_id === candidate.company_id).map((job) => {
    const title = jaccard(candidate.title, job.title); const description = descriptionSimilarity(candidate.description, job.description); const sameDisplay=candidate.location.display.toLowerCase()===job.location.display.toLowerCase();const bothRemote=candidate.location.workplace_type==='remote'&&job.location.workplace_type==='remote';const usRemoteCompatible=(candidate.location.workplace_type==='remote'&&job.location.country==='US')||(job.location.workplace_type==='remote'&&candidate.location.country==='US');const sameKnownCity=candidate.location.city&&job.location.city&&candidate.location.city===job.location.city;const location = sameDisplay||bothRemote||usRemoteCompatible||sameKnownCity ? 1 : 0;
    return { job, score: title * .55 + description * .35 + location * .1, features: { title_similarity: title, description_similarity: description, location_compatible: Boolean(location) } };
  }).sort((a,b) => b.score-a.score).slice(0, limit);
}
