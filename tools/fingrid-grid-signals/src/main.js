// Apify actor entry point: Fingrid grid & reserve signals (+ derived CO2 / cheap-hour signal, Fingrid data only).
import { Actor, log } from 'apify';
import { createClient, runMode, MissingApiKeyError } from './lib/fingrid.js';
import { chargeSafe } from './lib/charge.js';

await Actor.init();
try {
  await chargeSafe('actor-start');
  const input = (await Actor.getInput()) || {};
  const { modes = ['grid_snapshot', 'cheap_hours', 'co2'], hoursBack = 24, hoursAhead = 36, topN = 6, datasetIds = [] } = input;
  // Key: secret actor input (preferred, user's own key) or env var FINGRID_API_KEY.
  const apiKey = input.fingridApiKey || process.env.FINGRID_API_KEY;
  if (!apiKey) throw new MissingApiKeyError();
  const client = createClient({ apiKey });
  const summary = {};
  for (const mode of modes) {
    const recs = await runMode(mode, { client, hoursBack, hoursAhead, topN, datasetIds });
    for (const r of recs) await Actor.pushData({ mode, ...r });
    await chargeSafe(['cheap_hours', 'co2'].includes(mode) ? 'derived-signal' : 'data-records', ['cheap_hours', 'co2'].includes(mode) ? 1 : Math.ceil(recs.length / 100));
    summary[mode] = recs.length;
    log.info(`mode ${mode}: ${recs.length} records`);
  }
  await Actor.setValue('OUTPUT_SUMMARY', { ...summary, attribution: 'Source Fingrid / data.fingrid.fi, license CC 4.0 BY' });
} catch (err) {
  log.exception(err, 'Run failed');
  await Actor.fail(String(err.message || err));
}
await Actor.exit();
