import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSafetyGateClient, parseReport, splitBarcodes, normGtin, matchProducts, filterAlerts, safetyGateAttribution, LIST_URL } from '../src/lib/safetygate.js';

const fx = (f) => readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', f), 'utf8');
const noLimit = (fn) => fn();
function sgFetch() {
  const calls = [];
  const f = async (url) => {
    calls.push(String(url));
    const body = String(url) === LIST_URL ? fx('list.xml') : fx('week43.xml');
    return new Response(body, { status: 200 });
  };
  f.calls = calls;
  return f;
}
const alerts = parseReport(fx('week43.xml'), { reference: 'Report-2026-43' });

test('parses all 67 alerts of report 2026-43 with links', () => {
  assert.equal(alerts.length, 67);
  for (const a of alerts) {
    assert.match(a.alertUrl, /^https:\/\/ec\.europa\.eu\/safety-gate-alerts\//);
    assert.ok(a.caseNumber);
    assert.equal(a.reportDate, '2026-10-30');
  }
  assert.ok(alerts.some((a) => a.measures.length && a.measures[0].measure));
});

test('barcode splitting handles concatenated EANs', () => {
  assert.deepEqual(splitBarcodes('8054117837792 8058956727092'), ['8054117837792', '8058956727092']);
  assert.deepEqual(splitBarcodes('80541178377928054117837808'), ['8054117837792', '8054117837808']);
  assert.deepEqual(splitBarcodes(''), []);
  assert.equal(normGtin('00719565509629'), '719565509629');
});

test('GTIN, ASIN and brand+model matching', () => {
  const withGtin = alerts.find((a) => a.barcodes.length);
  const withAsin = alerts.find((a) => a.onlineListingIds.some((x) => /^B0/.test(x)));
  const withBrandModel = alerts.find((a) => a.brand && a.model && a.model.length >= 4);
  const res = matchProducts(alerts, [
    { sku: 'g', gtin: '0' + withGtin.barcodes[0] },
    { sku: 'a', listingId: withAsin.onlineListingIds.find((x) => /^B0/.test(x)) },
    { sku: 'b', brand: withBrandModel.brand.toUpperCase(), model: withBrandModel.model.replace(/-/g, ' ') },
    { sku: 'none', gtin: '1234567890123', brand: 'NoSuchBrandXYZ' },
  ]);
  assert.equal(res.length, 3);
  assert.equal(res.find((r) => r.input.sku === 'g').matches[0].matchType, 'gtin');
  assert.equal(res.find((r) => r.input.sku === 'a').matches[0].matchType, 'listing_id');
  assert.equal(res.find((r) => r.input.sku === 'b').matches[0].alert.caseNumber, withBrandModel.caseNumber);
});

test('filters', () => {
  const chem = filterAlerts(alerts, { riskType: 'chemical' });
  assert.ok(chem.length >= 17 && chem.every((a) => a.riskType.some((r) => /chemical/i.test(r))));
  const cn = filterAlerts(alerts, { countryOfOrigin: 'china' });
  assert.ok(cn.length > 0);
});

test('no personal data: marketplace seller free text not output', () => {
  for (const a of alerts) assert.equal(a.onlineTrader, undefined);
});

test('client: list + report fetch, cached across calls', async () => {
  const f = sgFetch();
  const c = createSafetyGateClient({ fetchImpl: f, limiter: noLimit });
  const r = await c.alerts({ weeks: 1, riskType: 'Electric shock', limit: 5 });
  assert.deepEqual(r.reportsScanned, ['Report-2026-43']);
  assert.equal(r.alertsScanned, 67);
  assert.ok(r.alerts.length <= 5 && r.alerts.length > 0);
  const m = await c.match({ products: [{ gtin: alerts.find((a) => a.barcodes.length).barcodes[0] }], weeks: 1 });
  assert.equal(m.productsMatched, 1);
  assert.equal(f.calls.length, 2, 'list + one report, then cached');
  await assert.rejects(() => c.match({ products: [] }), /non-empty/);
});

test('attribution', () => {
  assert.match(safetyGateAttribution().licence, /CC0/);
});
