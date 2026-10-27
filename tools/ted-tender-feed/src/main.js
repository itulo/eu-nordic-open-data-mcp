// Apify actor entry point: TED EU tender feed (CPV / country / date filters, dedupe, alert mode).
import { Actor, log } from 'apify';
import { searchTenders, filterNew, alertWindow } from './lib/ted.js';
import { chargeSafe } from './lib/charge.js';

await Actor.init();
try {
  await chargeSafe('actor-start');
  const input = (await Actor.getInput()) || {};
  const {
    cpvCodes = [], countries = [], countryField = 'buyer', noticeTypes = ['competition'],
    publishedFrom, publishedTo, maxResults = 200, language = 'eng', collapseByProcedure = false,
    alertMode = false, alertStateKey = 'default',
  } = input;

  let window = { publishedFrom, publishedTo };
  let store, stateKey, state;
  if (alertMode) {
    // Named store persists between runs (unnamed default store is per-run on Apify).
    store = await Actor.openKeyValueStore('ted-tender-feed-alert-state');
    stateKey = `STATE-${String(alertStateKey).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    state = (await store.getValue(stateKey)) || {};
    if (!publishedFrom) window = alertWindow(state);
  } else if (!publishedFrom && !publishedTo) {
    const today = new Date();
    window = { publishedFrom: new Date(today.getTime() - 7 * 864e5).toISOString().slice(0, 10), publishedTo: today.toISOString().slice(0, 10) };
  }

  const { query, total, records } = await searchTenders({ cpvCodes, countries, countryField, noticeTypes, ...window, maxResults, language, collapseByProcedure });
  log.info(`TED query: ${query} -> ${total} total, ${records.length} returned`);

  let out = records;
  if (alertMode) {
    const r = filterNew(records, state);
    out = r.fresh;
    await store.setValue(stateKey, r.state);
    log.info(`Alert mode: ${out.length} new notices since last run (${state.lastRunAt || 'first run'})`);
  }
  for (const rec of out) {
    const c = await chargeSafe('tender-notice');
    if (c?.eventChargeLimitReached && c?.chargedCount === 0) break;
    await Actor.pushData({ ...rec, alertMode });
    if (c?.eventChargeLimitReached) break;
  }
  await Actor.setValue('OUTPUT_SUMMARY', { query, totalMatching: total, returned: out.length, alertMode, window, attribution: out[0]?.attribution });
} catch (err) {
  log.exception(err, 'Run failed');
  await Actor.fail(String(err.message || err));
}
await Actor.exit();
