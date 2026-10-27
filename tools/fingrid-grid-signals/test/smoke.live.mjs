// LIVE smoke test against the Fingrid API. Needs FINGRID_API_KEY. Exit 0 = pass, 1 = fail, 2 = SKIPPED (no key).
import { createClient, runMode } from '../src/lib/fingrid.js';
if (!process.env.FINGRID_API_KEY) {
  console.log(JSON.stringify({ ok: null, skipped: true, reason: 'FINGRID_API_KEY not set - live test pending key from Italo' }));
  process.exit(2);
}
const client = createClient();
const t0 = Date.now();
const out = {};
for (const m of ['grid_snapshot', 'cheap_hours', 'co2', 'reserves']) out[m] = (await runMode(m, { client, hoursBack: 6 })).length;
const ok = out.grid_snapshot > 5 && out.cheap_hours > 0 && out.co2 === 1;
console.log(JSON.stringify({ ok, ms: Date.now() - t0, counts: out }));
process.exit(ok ? 0 : 1);
