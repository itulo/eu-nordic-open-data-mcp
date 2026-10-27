// Health check for both FMI WFS and Fingrid Open Data API.
const fmiUrl = 'https://opendata.fmi.fi/wfs?service=WFS&version=2.0.0&request=getFeature&storedquery_id=fmi::forecast::edited::weather::scandinavia::point::simple&place=Helsinki&timestep=60&parameters=Temperature,WindSpeedMS';
const fgBase = 'https://data.fingrid.fi/api';
const key = process.env.FINGRID_API_KEY;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const t0 = Date.now();
const out = { tool: 'fmi-fingrid-nowcast', checkedAt: new Date().toISOString(), upstreams: {} };
try {
  const fmiRes = await fetch(fmiUrl, { signal: AbortSignal.timeout(20000) });
  const fmiText = await fmiRes.text();
  const fmiHasElements = fmiText.includes('<BsWfs:BsWfsElement');
  out.upstreams.fmi = { http: fmiRes.status, ok: fmiRes.ok && fmiHasElements };

  await sleep(2200); // respect Fingrid 1 req / 2 s rate limit across sequential health checks
  let fgRes = await fetch(`${fgBase}/health`, {
    headers: key ? { 'x-api-key': key } : {},
    signal: AbortSignal.timeout(20000),
  });
  if (fgRes.status === 429) {
    await sleep(2200);
    fgRes = await fetch(`${fgBase}/health`, {
      headers: key ? { 'x-api-key': key } : {},
      signal: AbortSignal.timeout(20000),
    });
  }
  out.upstreams.fingrid = { http: fgRes.status, ok: key ? fgRes.ok : fgRes.status === 401 };
  out.latencyMs = Date.now() - t0;
  out.status = out.upstreams.fmi.ok && out.upstreams.fingrid.ok ? 'up' : 'degraded';
} catch (e) {
  out.status = 'down';
  out.error = e.message;
}
console.log(JSON.stringify(out));
process.exit(out.status === 'up' ? 0 : 1);
