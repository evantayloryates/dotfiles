export function normalizeLocation(raw = '', workplaceHint = '') {
  const display = String(raw || workplaceHint || 'Unknown').trim(); const text = `${display} ${workplaceHint}`.toLowerCase();
  const workplace_type = /hybrid/.test(text) ? 'hybrid' : /remote/.test(text) ? 'remote' : /on[ -]?site|in[ -]?person/.test(text) ? 'in_person' : 'unknown';
  const nyc = /new york|nyc|brooklyn|manhattan/.test(text);
  return { display, city: nyc ? 'New York' : null, region: nyc ? 'NY' : null, country: /\b(us|usa|united states)\b/.test(text) || nyc ? 'US' : null, workplace_type };
}
