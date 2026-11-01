// LIVE smoke test against the official EU Safety Gate weekly XML (CC0). Exit 0 = pass.
import { createSafetyGateClient } from '../src/lib/safetygate.js';
const t0 = Date.now(); const c = createSafetyGateClient(); const r = await c.alerts({ weeks: 1, limit: 5 });
const ok = r.alertsScanned > 0 && r.alerts.length > 0;
console.log(JSON.stringify({ ok, ms: Date.now() - t0, reportsScanned: r.reportsScanned, alertsScanned: r.alertsScanned }));
process.exit(ok ? 0 : 1);
