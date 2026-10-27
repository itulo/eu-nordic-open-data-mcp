// Uptime / health check for the Fingrid API. With FINGRID_API_KEY: calls /api/health and /api/datasets/193/data/latest.
// Without key: checks that the API gateway answers (401 = reachable) -> status "reachable-no-key". One JSON line.
// Retries once on HTTP 429 (Fingrid enforces 1 req / 2 s per API key across processes).
const base = "https://data.fingrid.fi/api";
const key = process.env.FINGRID_API_KEY;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWithRetry(url, headers) {
  let res = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
  if (res.status === 429) {
    await sleep(2200);
    res = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
  }
  return res;
}

const t0 = Date.now();
const out = { tool: "fingrid-grid-signals", upstream: base, checkedAt: new Date().toISOString() };
try {
  const res = await getWithRetry(`${base}/health`, key ? { "x-api-key": key } : {});
  out.http = res.status;
  out.latencyMs = Date.now() - t0;
  if (!key) {
    out.status = res.status === 401 ? "reachable-no-key" : "unexpected";
  } else {
    await sleep(2100); // 1 request / 2 s limit
    const l = await getWithRetry(`${base}/datasets/193/data/latest`, { "x-api-key": key });
    const j = await l.json().catch(() => null);
    const ageMin = j?.startTime ? (Date.now() - Date.parse(j.startTime)) / 60000 : null;
    out.latestConsumption = j?.value ?? null;
    out.dataAgeMin = ageMin !== null ? Math.round(ageMin) : null;
    out.status = res.ok && l.ok && ageMin !== null && ageMin < 30 ? "up" : "degraded";
  }
} catch (e) {
  out.status = "down";
  out.error = e.message;
}
console.log(JSON.stringify(out));
process.exit(out.status === "up" || out.status === "reachable-no-key" ? 0 : 1);
