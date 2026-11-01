// Apify actor entry point: PRH/YTJ company-events feed (company-level fields only).
// registry = 'fi_prh' (default, unchanged behaviour) or 'no_brreg' (Norway, Brreg Enhetsregisteret, NLOD 2.0).
import { Actor, log } from 'apify';
import { fetchEvents, watchCompanies, filterNewEvents, defaultWindow, DEFAULT_EVENTS } from './lib/prh.js';
import { fetchEventsNo, watchCompaniesNo } from './lib/brreg.js';
import { chargeSafe, pushCharged } from './lib/charge.js';

await Actor.init();
try {
  await chargeSafe('actor-start');
  const input = (await Actor.getInput()) || {};
  const { registry = 'fi_prh', eventTypes = DEFAULT_EVENTS, dateFrom, dateTo, location, companyForm, maxPerEvent = 500, watchBusinessIds = [], alertMode = false, alertStateKey = 'default' } = input;
  if (!['fi_prh', 'no_brreg'].includes(registry)) throw new Error(`Unknown registry "${registry}" (use fi_prh or no_brreg)`);
  const isNo = registry === 'no_brreg';
  const store = await Actor.openKeyValueStore('prh-company-events-state');
  const key = (isNo ? 'NO-' : '') + String(alertStateKey).replace(/[^a-zA-Z0-9_-]/g, '_');
  const state = alertMode ? (await store.getValue(`ALERT-${key}`)) || {} : {};
  const win = dateFrom && dateTo ? { dateFrom, dateTo } : defaultWindow(state);

  let records = [];
  const summary = isNo ? { registry, window: win } : { window: win };
  if (eventTypes.length) {
    const r = await (isNo ? fetchEventsNo : fetchEvents)({ eventTypes, ...win, location, companyForm, maxPerEvent });
    records.push(...r.records);
    summary.stats = r.stats;
  }
  if (watchBusinessIds.length) {
    const prev = (await store.getValue(`WATCH-${key}`)) || {};
    const w = await (isNo ? watchCompaniesNo : watchCompanies)(watchBusinessIds, prev);
    await store.setValue(`WATCH-${key}`, w.snapshots);
    records.push(...w.records);
    summary.watchlist = { watched: watchBusinessIds.length, changes: w.records.length, firstSeen: w.firstSeen.length, notFound: w.notFound, ...(isNo ? { excludedPersonEntities: w.excludedPersonEntities } : {}) };
  }
  if (alertMode) {
    const r = filterNewEvents(records, state);
    records = r.fresh;
    await store.setValue(`ALERT-${key}`, r.state);
  }
  for (const rec of records) {
    // Write first, charge only for successfully stored items (SDK handles the charge limit).
    const { stop } = await pushCharged(rec, 'company-event');
    if (stop) break;
  }
  summary.returned = records.length;
  summary.attribution = records[0]?.attribution;
  log.info(`${isNo ? 'Brreg' : 'PRH'} events ${win.dateFrom}..${win.dateTo}: ${records.length} records`, summary.stats || {});
  await Actor.setValue('OUTPUT_SUMMARY', summary);
} catch (err) {
  log.exception(err, 'Run failed');
  await Actor.fail(String(err.message || err));
}
await Actor.exit();
