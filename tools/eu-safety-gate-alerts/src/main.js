// Apify actor: EU Safety Gate dangerous-product alerts monitor + catalogue screening (official weekly-report XML, CC0 1.0).
import { Actor, log } from 'apify';
import { createSafetyGateClient, safetyGateAttribution } from './lib/safetygate.js';
import { chargeSafe, pushCharged } from './lib/charge.js';

const STATE_STORE = 'eu-safety-gate-alerts-state';
const MAX_SEEN = 50000;

export function alertRecord(a, base) {
  return { recordType: 'safety_gate_alert', ...a, ...base };
}

export function productCheckRecord(p, i, hit, base) {
  const matches = (hit?.matches || []).map((m) => ({
    matchType: m.matchType, score: m.score,
    caseNumber: m.alert.caseNumber, alertUrl: m.alert.alertUrl, reportDate: m.alert.reportDate,
    category: m.alert.category, product: m.alert.product, brand: m.alert.brand, name: m.alert.name, model: m.alert.model,
    barcodes: m.alert.barcodes, riskType: m.alert.riskType, riskLevel: m.alert.riskLevel, measures: m.alert.measures,
    notifyingCountry: m.alert.notifyingCountry, countryOfOrigin: m.alert.countryOfOrigin,
  }));
  return { recordType: 'safety_gate_product_check', index: i, input: p, matched: matches.length > 0, matchCount: matches.length, bestMatchType: matches[0]?.matchType || null, matches, ...base };
}

await Actor.init();
try {
  await chargeSafe('actor-start');
  const input = (await Actor.getInput()) || {};
  const { mode = 'alerts', weeks, maxResults = 1000, onlyNew = false, products = [],
    notifyingCountry, countryOfOrigin, category, riskType, riskLevel, query, fromDate } = input;
  const client = createSafetyGateClient();
  const attr = safetyGateAttribution();
  const base = { source: 'European Commission Safety Gate weekly reports (ec.europa.eu/safety-gate-alerts)', retrievedAt: new Date().toISOString(), ...attr };
  let written = 0; let summary;

  if (mode === 'match') {
    if (!Array.isArray(products) || !products.length) throw new Error('match mode needs `products`: an array of {gtin?, brand?, model?, name?, listingId?}.');
    const list = products.slice(0, 10000);
    const r = await client.match({ products: list, weeks: Math.min(Math.max(weeks || 8, 1), 52) });
    const byIndex = new Map(r.results.map((x) => [x.index, x]));
    for (let i = 0; i < list.length; i++) {
      const { stop } = await pushCharged(productCheckRecord(list[i], i, byIndex.get(i), base), 'product-match');
      written++; if (stop) break;
    }
    summary = { mode, reportsScanned: r.reportsScanned, coverage: r.coverage, alertsScanned: r.alertsScanned, productsChecked: written, productsMatched: r.productsMatched };
  } else if (mode === 'alerts') {
    const r = await client.alerts({ weeks: Math.min(Math.max(weeks || 1, 1), 52), limit: 100000, notifyingCountry, countryOfOrigin, category, riskType, riskLevel, query, fromDate });
    let alerts = r.alerts;
    let store; let seen = [];
    if (onlyNew) {
      store = await Actor.openKeyValueStore(STATE_STORE);
      seen = (await store.getValue('SEEN_CASES')) || [];
      const s = new Set(seen);
      alerts = alerts.filter((a) => a.caseNumber && !s.has(a.caseNumber));
    }
    const newSeen = [];
    for (const a of alerts.slice(0, maxResults)) {
      const { stop } = await pushCharged(alertRecord(a, base), 'alert-record');
      written++; if (a.caseNumber) newSeen.push(a.caseNumber);
      if (stop) break;
    }
    if (onlyNew) await store.setValue('SEEN_CASES', [...seen, ...newSeen].slice(-MAX_SEEN));
    summary = { mode, reportsScanned: r.reportsScanned, alertsScanned: r.alertsScanned, matchedFilters: r.matched, onlyNew, alertsWritten: written };
  } else {
    throw new Error(`Unknown mode "${mode}" (use alerts or match).`);
  }
  await Actor.setValue('OUTPUT_SUMMARY', { ...summary, ...attr });
  log.info(`eu-safety-gate-alerts completed: ${JSON.stringify({ mode, written })}`);
} catch (err) {
  log.exception(err, 'Run failed');
  await Actor.fail(String(err.message || err));
}
await Actor.exit();
