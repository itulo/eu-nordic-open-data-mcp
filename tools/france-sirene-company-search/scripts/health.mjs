// Uptime check for API Recherche d'entreprises. Exit 0 = healthy.
const out = { tool: 'france-sirene-company-search', checkedAt: new Date().toISOString(), upstreams: {} }; const t0 = Date.now(); let healthy = false;
try { const r = await fetch('https://recherche-entreprises.api.gouv.fr/search?q=airbus&per_page=1', { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20000) }); const j = await r.json().catch(() => null); healthy = r.ok && Array.isArray(j?.results); out.upstreams.rechercheEntreprises = { status: healthy ? 'up' : 'degraded', http: r.status, latencyMs: Date.now() - t0 }; }
catch (e) { out.upstreams.rechercheEntreprises = { status: 'down', error: e.message }; }
out.status = healthy ? 'up' : 'degraded'; console.log(JSON.stringify(out)); process.exit(healthy ? 0 : 1);
