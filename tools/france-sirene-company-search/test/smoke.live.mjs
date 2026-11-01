// LIVE smoke test against API Recherche d'entreprises (keyless). Exit 0 = pass.
import { createSireneClient } from '../src/lib/sirene.js';
const t0 = Date.now(); const c = createSireneClient(); const stats = { pages: 0, seen: 0, excluded: {} }; const recs = [];
for await (const r of c.search({ query: 'airbus', maxResults: 10 }, stats)) { recs.push(r); if (recs.length >= 10) break; }
const optOutLeak = recs.some((r) => r.marketingOptOut === true);
const ok = recs.length > 0 && recs.every((r) => r.attribution && r.siren) && !optOutLeak;
console.log(JSON.stringify({ ok, ms: Date.now() - t0, returned: recs.length, stats, optOutLeak }));
process.exit(ok ? 0 : 1);
