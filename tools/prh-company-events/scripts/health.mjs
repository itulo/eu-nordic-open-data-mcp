// Uptime / health check for PRH upstream APIs. Exit 0 = healthy. One JSON line.
const checks = {
  ytj: 'https://avoindata.prh.fi/opendata-ytj-api/v3/companies?businessId=0116297-6',
  registeredNotices: 'https://avoindata.prh.fi/opendata-registerednotices-api/v3/0116297-6',
};
const out = { tool: 'prh-company-events', checkedAt: new Date().toISOString(), upstreams: {} };
let healthy = true;
for (const [k, url] of Object.entries(checks)) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
    const j = await res.json().catch(() => null);
    const up = res.ok && j && typeof j === 'object' && (typeof j.totalResults === 'number' || 'businessId' in j || Array.isArray(j.companies));
    out.upstreams[k] = { status: up ? 'up' : 'degraded', http: res.status, latencyMs: Date.now() - t0 };
    healthy &&= up;
  } catch (e) { out.upstreams[k] = { status: 'down', error: e.message }; healthy = false; }
  await new Promise((r) => setTimeout(r, 1000));
}
out.status = healthy ? 'up' : 'degraded';
console.log(JSON.stringify(out));
process.exit(healthy ? 0 : 1);
