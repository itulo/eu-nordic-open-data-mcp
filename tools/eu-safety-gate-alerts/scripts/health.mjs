// Uptime check for the Safety Gate weekly report list. Exit 0 = healthy.
import { LIST_URL } from '../src/lib/safetygate.js';
const out = { tool: 'eu-safety-gate-alerts', checkedAt: new Date().toISOString(), upstreams: {} }; const t0 = Date.now(); let healthy = false;
try { const r = await fetch(LIST_URL, { signal: AbortSignal.timeout(30000) }); const t = await r.text(); healthy = r.ok && t.includes('<'); out.upstreams.weeklyReportList = { status: healthy ? 'up' : 'degraded', http: r.status, latencyMs: Date.now() - t0 }; }
catch (e) { out.upstreams.weeklyReportList = { status: 'down', error: e.message }; }
out.status = healthy ? 'up' : 'degraded'; console.log(JSON.stringify(out)); process.exit(healthy ? 0 : 1);
