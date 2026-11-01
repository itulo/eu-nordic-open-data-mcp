import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { vatRateRecords } from '../src/vat-rates-mode.js';

const fx = (f) => readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', f), 'utf8');
const noLimit = (fn) => fn();
const xmlFetch = (pick) => async (url, init) => new Response(fx(pick(init.body)), { status: 200, headers: { 'content-type': 'text/xml' } });

test('vat_rates headline mode: one CC BY 4.0-attributed record per country', async () => {
  const recs = await vatRateRecords({ vatRateCountries: ['FI', 'ES', 'GR'] }, { fetchImpl: xmlFetch(() => 'fi_es_el.xml'), limiter: noLimit });
  assert.equal(recs.length, 3);
  assert.deepEqual(recs.map((r) => r.countryCode), ['FI', 'ES', 'EL']);
  for (const r of recs) { assert.equal(r.recordType, 'eu_vat_rates'); assert.match(r.attribution, /CC BY 4\.0/); assert.ok(typeof r.standardRate === 'number'); }
});

test('vat_rates lookup mode: CN code rows per country with standard-rate fallback', async () => {
  const recs = await vatRateRecords({ vatRateCountries: ['FI', 'DE'], cnCodes: ['4901'] }, { fetchImpl: xmlFetch((b) => (/4901/.test(b) ? 'fi_de_4901.xml' : 'fi_es_el.xml')), limiter: noLimit });
  assert.equal(recs.length, 2);
  assert.equal(recs[0].recordType, 'eu_vat_rate_lookup');
  assert.ok(recs.some((r) => r.matchedRates.length > 0));
});
