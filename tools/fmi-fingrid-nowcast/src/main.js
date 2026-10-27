// Apify actor entry point: FMI Weather + Fingrid Wind/Solar/Consumption Joined Nowcast Feature Feed.
// Never logs, echoes, or stores the Fingrid API key in dataset output or logs.
import { Actor, log } from 'apify';
import { createNowcastClient, runNowcast, dualAttribution, DEFAULT_HUBS, MissingApiKeyError } from './lib/nowcast.js';
import { chargeSafe } from './lib/charge.js';

await Actor.init();
try {
  await chargeSafe('actor-start');
  const input = (await Actor.getInput()) || {};
  const {
    mode = 'joined_nowcast',
    places = DEFAULT_HUBS.map((h) => h.name),
    hoursBack = 6,
    hoursAhead = 36,
    topN = 6,
    includeStationBreakdown = false,
  } = input;

  const fingridApiKey = input.fingridApiKey || process.env.FINGRID_API_KEY;
  if (mode === 'joined_nowcast' && !fingridApiKey) {
    throw new MissingApiKeyError();
  }

  const client = createNowcastClient({ fingridApiKey });
  const records = await runNowcast({
    mode,
    client,
    places,
    hoursBack,
    hoursAhead,
    topN,
    includeStationBreakdown,
  });

  for (const r of records) {
    await Actor.pushData(r);
    await chargeSafe('nowcast-hour', 1);
  }

  const attr = dualAttribution();
  const evRecommendedHours = records.filter((r) => r.isEvChargeRecommended).map((r) => r.hourStartHelsinki);
  await Actor.setValue('OUTPUT_SUMMARY', {
    mode,
    places,
    hoursBack,
    hoursAhead,
    recordsWritten: records.length,
    evRecommendedHours,
    ...attr,
  });
  log.info(`fmi-fingrid-nowcast completed: mode=${mode}, records=${records.length}`);
} catch (err) {
  log.exception(err, 'Run failed');
  await Actor.fail(String(err.message || err));
}
await Actor.exit();
