// Uptime check for upstreams. Exit 0 = healthy. Companies House answers 401 without a key (still "up").
const checks = { gleif: ['https://api.gleif.org/api/v1/lei-records?page[size]=1', [200]], companiesHouse: ['https://api.company-information.service.gov.uk/company/00445790', [200, 401]] };
const out = { tool: 'uk-companies-house-kyb', checkedAt: new Date().toISOString(), upstreams: {} }; let healthy = true;
for (const [k, [url, okCodes]] of Object.entries(checks)) { const t0 = Date.now();
  try { const r = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20000) }); const up = okCodes.includes(r.status); out.upstreams[k] = { status: up ? 'up' : 'degraded', http: r.status, latencyMs: Date.now() - t0 }; healthy &&= up; }
  catch (e) { out.upstreams[k] = { status: 'down', error: e.message }; healthy = false; } }
out.status = healthy ? 'up' : 'degraded'; console.log(JSON.stringify(out)); process.exit(healthy ? 0 : 1);
