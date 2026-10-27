// Uptime / health check for the TED upstream. Exit 0 = healthy, 1 = degraded/down. Prints one JSON line (cron/monitor friendly).
import { TED_SEARCH_URL } from '../src/lib/ted.js';
const t0 = Date.now();
let status = 'down', detail = null, http = null;
try {
  const yesterday = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10).replace(/-/g, '');
  const res = await fetch(TED_SEARCH_URL, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, signal: AbortSignal.timeout(20000),
    body: JSON.stringify({ query: `publication-date>=${yesterday}`, fields: ['publication-number'], limit: 1 }) });
  http = res.status;
  const j = await res.json().catch(() => null);
  status = res.ok && Array.isArray(j?.notices) ? 'up' : 'degraded';
  detail = j?.totalNoticeCount ?? j?.message ?? null;
} catch (e) { detail = e.message; }
console.log(JSON.stringify({ tool: 'ted-tender-feed', upstream: 'api.ted.europa.eu', status, http, latencyMs: Date.now() - t0, detail, checkedAt: new Date().toISOString() }));
process.exit(status === 'up' ? 0 : 1);
