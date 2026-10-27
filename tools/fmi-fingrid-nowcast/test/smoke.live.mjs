// LIVE smoke test against both FMI Open Data WFS (anonymous) and Fingrid Open Data API (requires FINGRID_API_KEY).
// Exit 0 = pass, 1 = fail, 2 = skipped (if FINGRID_API_KEY is missing).
import { createNowcastClient, runNowcast } from '../src/lib/nowcast.js';

if (!process.env.FINGRID_API_KEY) {
  console.log(JSON.stringify({ ok: null, skipped: true, reason: 'FINGRID_API_KEY not set' }));
  process.exit(2);
}

const t0 = Date.now();
const client = createNowcastClient();
const joined = await runNowcast({
  mode: 'joined_nowcast',
  client,
  places: ['Oulu', 'Vaasa', 'Pori', 'Helsinki', 'Lappeenranta'],
  hoursBack: 4,
  hoursAhead: 24,
  topN: 4,
});

const allHaveDualAttribution = joined.every(
  (r) =>
    r.attribution &&
    r.attribution.includes('Source Fingrid / data.fingrid.fi, license CC 4.0 BY') &&
    r.attribution.includes('Ilmatieteen laitoksen avoin data')
);

const ok = joined.length >= 12 && allHaveDualAttribution;
console.log(
  JSON.stringify({
    ok,
    ms: Date.now() - t0,
    records: joined.length,
    allHaveDualAttribution,
    evRecommendedCount: joined.filter((r) => r.isEvChargeRecommended).length,
    sample: joined[0]
      ? {
          hourStartHelsinki: joined[0].hourStartHelsinki,
          fmiWindSpeedWeightedMs: joined[0].fmiWindSpeedWeightedMs,
          fmiTempDemandWeightedC: joined[0].fmiTempDemandWeightedC,
          fingridWindForecastMW: joined[0].fingridWindForecastMW,
          fingridConsumptionForecastMW: joined[0].fingridConsumptionForecastMW,
          residualLoadMW: joined[0].residualLoadMW,
          rank: joined[0].rank,
        }
      : null,
  })
);
process.exit(ok ? 0 : 1);
