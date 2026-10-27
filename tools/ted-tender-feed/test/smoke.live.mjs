// LIVE smoke test against the real TED Search API (no key needed). Run: npm run smoke
import { searchTenders } from '../src/lib/ted.js';
const today = new Date();
const from = new Date(today.getTime() - 14 * 864e5).toISOString().slice(0, 10);
const t0 = Date.now();
const r = await searchTenders({ cpvCodes: ['72000000'], countries: ['FI', 'SE', 'EE'], publishedFrom: from, noticeTypes: ['competition'], maxResults: 20 });
const ok = r.records.length > 0 && r.records.every((x) => x.attribution && x.publicationNumber && x.url);
console.log(JSON.stringify({ ok, ms: Date.now() - t0, query: r.query, total: r.total, returned: r.records.length, sample: r.records[0] && { pn: r.records[0].publicationNumber, title: r.records[0].title, buyer: r.records[0].buyerNames[0] } }, null, 1));
process.exit(ok ? 0 : 1);
