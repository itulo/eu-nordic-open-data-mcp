// Apify actor entry point: PRH/YTJ company-events feed (company-level fields only).
import { Actor, log } from 'apify';
import { fetchEvents, watchCompanies, filterNewEvents, defaultWindow, DEFAULT_EVENTS } from './lib/prh.js';
import { chargeSafe } from './lib/charge.js';

await Actor.init();
try {
  await chargeSafe('actor-start');
  const input = (await Actor.getInput()) || {};
  const { eventTypes = DEFAULT_EVENTS, dateFrom, dateTo, location, companyForm, maxPerEvent = 500, watchBusinessIds = [], alertMode = false, alertStateKey = 'default' } = input;
  const store = await Actor.openKeyValueStore('prh-company-events-state');
  const key = String(alertStateKey).replace(/[^a-zA-Z0-9_-]/g, '_');
  const state = alertMode ? (await store.getValue(`ALERT-${key}`)) || {} : {};
  const win = dateFrom && dateTo ? { dateFrom, dateTo } : defaultWindow(state);

  let records = [];
  const summary = { window: win };
  if (eventTypes.length) {
    const r = await fetchEvents({ eventTypes, ...win, location, companyForm, maxPerEvent });
    records.push(...r.records);
    summary.stats = r.stats;
  }
  if (watchBusinessIds.length) {
    const prev = (await store.getValue(`WATCH-${key}`)) || {};
    const w = await watchCompanies(watchBusinessIds, prev);
    await store.setValue(`WATCH-${key}`, w.snapshots);
    records.push(...w.records);
    summary.watchlist = { watched: watchBusinessIds.length, changes: w.records.length, firstSeen: w.firstSeen.length, notFound: w.notFound };
  }
  if (alertMode) {
    const r = filterNewEvents(records, state);
    records = r.fresh;
    await store.setValue(`ALERT-${key}`, r.state);
  }
  for (const rec of records) {
    const c = await chargeSafe('company-event');
    if (c?.eventChargeLimitReached && c?.chargedCount === 0) break;
    await Actor.pushData(rec);
    if (c?.eventChargeLimitReached) break;
  }
  summary.returned = records.length;
  summary.attribution = records[0]?.attribution;
  log.info(`PRH events ${win.dateFrom}..${win.dateTo}: ${records.length} records`, summary.stats || {});
  await Actor.setValue('OUTPUT_SUMMARY', summary);
} catch (err) {
  log.exception(err, 'Run failed');
  await Actor.fail(String(err.message || err));
}
await Actor.exit();
