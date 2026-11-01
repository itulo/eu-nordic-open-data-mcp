// LIVE smoke test (keyless GLEIF path; Companies House needs COMPANIES_HOUSE_API_KEY). Exit 0 = pass.
import { createGleifClient } from '../src/lib/gleif.js';
const t0 = Date.now();
const g = createGleifClient();
const s = await g.search({ registeredAs: '00445790', country: 'GB', limit: 5 });
const o = await g.ownership('549300TRUWO2CD2G5692');
const ok = s.count > 0 && o.found === true;
console.log(JSON.stringify({ ok, ms: Date.now() - t0, gleifSearchCount: s.count, ownershipFound: o.found, companiesHouseKey: Boolean(process.env.COMPANIES_HOUSE_API_KEY) }));
process.exit(ok ? 0 : 1);
