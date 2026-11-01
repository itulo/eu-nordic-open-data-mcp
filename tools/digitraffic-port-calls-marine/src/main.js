// Apify actor entry point: Fintraffic Digitraffic Baltic & Finnish Vessel Port Calls & Port Congestion Intelligence.
import { Actor, log } from 'apify';
import {
  createDigitrafficClient,
  normalizePortCalls,
  buildPortCongestionSummary,
  digitrafficAttribution,
} from './lib/digitraffic.js';
import { chargeSafe, pushCharged } from './lib/charge.js';

await Actor.init();
try {
  await chargeSafe('actor-start');
  const input = (await Actor.getInput()) || {};
  const {
    modes = ['port_calls', 'port_congestion_summary'],
    ports = ['FIHEL', 'FITKU', 'FIHKO', 'FIKTK'],
    cargoOnly = false,
    vesselQuery = '',
    maxResults = 30,
  } = input;

  const client = createDigitrafficClient();
  const raw = await client.fetchRawPortCalls();
  const records = [];

  if (modes.includes('port_congestion_summary')) {
    const allFiltered = normalizePortCalls(raw, { ports, cargoOnly, vesselQuery, maxResults: 2000 });
    const summaryRows = buildPortCongestionSummary(allFiltered);
    records.push(...summaryRows);
  }

  if (modes.includes('port_calls')) {
    const calls = normalizePortCalls(raw, { ports, cargoOnly, vesselQuery, maxResults });
    records.push(...calls);
  }

  for (const r of records) {
    // Write first, charge only for successfully stored items; stop at the user's charge limit.
    const { stop } = await pushCharged(r, 'port-call-record');
    if (stop) break;
  }

  await Actor.setValue('OUTPUT_SUMMARY', {
    modes,
    ports,
    cargoOnly,
    recordsWritten: records.length,
    dataUpdatedTime: raw?.dataUpdatedTime || null,
    ...digitrafficAttribution(),
  });
  log.info(`digitraffic-port-calls-marine completed: records=${records.length}`);
} catch (err) {
  log.exception(err, 'Run failed');
  await Actor.fail(String(err.message || err));
}
await Actor.exit();
