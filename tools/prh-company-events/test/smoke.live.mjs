// LIVE smoke test against the real PRH open data APIs (no key). Run: npm run smoke
import { fetchEvents, watchCompanies } from '../src/lib/prh.js';
const d = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
// use a recent weekday window (PRH registers on working days)
const t0 = Date.now();
const r = await fetchEvents({ eventTypes: ['new_company', 'name_change', 'liquidation'], dateFrom: d(5), dateTo: d(1), maxPerEvent: 20 });
const w = await watchCompanies(['0116297-6'], {});
const leaked = /"co"|"street"|apartment/i.test(JSON.stringify(r.records));
const ok = r.records.length > 0 && r.records.every((x) => x.attribution && x.businessId) && !leaked && w.firstSeen.length === 1;
console.log(JSON.stringify({ ok, ms: Date.now() - t0, stats: r.stats, returned: r.records.length, leakedPersonFields: leaked, watchlistProbe: { firstSeen: w.firstSeen, notFound: w.notFound }, sample: r.records[0] && { type: r.records[0].eventType, id: r.records[0].businessId, name: r.records[0].companyName } }, null, 1));
process.exit(ok ? 0 : 1);
