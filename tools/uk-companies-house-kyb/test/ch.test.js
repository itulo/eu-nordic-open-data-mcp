import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtureFetch } from '../src/lib/common.js';
import { createChClient, normaliseCompanyNumber } from '../src/lib/ch.js';

const fx = (f) => path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', f);
const noLimit = (fn) => fn();
const KEY = 'test-key-not-real';
const routes = [
  { match: /\/company\/12345678\/filing-history/, file: fx('filing_12345678.json') },
  { match: /\/company\/12345678\/charges/, file: fx('charges_12345678.json') },
  { match: /\/company\/12345678\/insolvency/, file: fx('insolvency_12345678.json') },
  { match: /\/company\/12345678$/, file: fx('profile_12345678.json') },
  { match: /\/search\/companies/, file: fx('search_example.json') },
  { match: /\/advanced-search\/companies/, file: fx('advanced_example.json') },
];

test('requires an API key with a helpful message', () => {
  assert.throws(() => createChClient({}), /API key is required.*developer\.company-information/);
});

test('company number normalisation', () => {
  assert.equal(normaliseCompanyNumber('445790'), '00445790');
  assert.equal(normaliseCompanyNumber('sc5336'), 'SC005336');
  assert.equal(normaliseCompanyNumber('OC301540'), 'OC301540');
  assert.throws(() => normaliseCompanyNumber('12-34'), /Invalid company number/);
});

test('basic auth header uses key as username; key never in URL', async () => {
  const f = fixtureFetch(routes);
  const c = createChClient({ apiKey: KEY, fetchImpl: f, limiter: noLimit });
  await c.profile('12345678');
  const h = f.calls[0].init.headers.authorization;
  assert.equal(h, `Basic ${Buffer.from(`${KEY}:`).toString('base64')}`);
  assert.ok(!f.calls[0].url.includes(KEY));
});

test('profile mapping: company-level, care_of dropped, never calls officer/PSC endpoints', async () => {
  const f = fixtureFetch(routes);
  const c = createChClient({ apiKey: KEY, fetchImpl: f, limiter: noLimit });
  const r = await c.profile('12345678');
  assert.equal(r.companyName, 'EXAMPLE WIDGETS LIMITED');
  assert.equal(r.accounts.nextDue, '2026-12-31');
  assert.equal(r.accounts.accountingReferenceDate, '31/03');
  assert.equal(r.registeredOfficeAddress.postalCode, 'M1 1AA');
  assert.equal(r.previousNames[0].name, 'EXAMPLE GADGETS LIMITED');
  assert.match(r.attribution, /Open Government Licence v3\.0/);
  await c.enrich(r, { filingHistory: 10, charges: true, insolvency: true });
  const s = JSON.stringify(r);
  for (const bad of ['JANE DOE', 'John Example Smith', 'Mr Private Lender', 'Example Bank PLC', 'Ann Practitioner', 'officer_name', 'practitioners', 'persons_entitled']) assert.ok(!s.includes(bad), bad);
  assert.equal(r.filingHistory.length, 3);
  assert.equal(r.filingHistory[0].descriptionValues.made_up_date, '2025-03-31');
  assert.deepEqual(r.filingHistory[1].descriptionValues, {});
  assert.equal(r.charges.items[0].personsEntitledCount, 2);
  assert.equal(r.insolvency.cases[0].type, 'creditors-voluntary-liquidation');
  assert.ok(f.calls.every((x) => !/officers|persons-with-significant-control|disqualified|members/.test(x.url)));
});

test('404 -> null, 401 -> clear key error', async () => {
  const c404 = createChClient({ apiKey: KEY, fetchImpl: fixtureFetch([]), limiter: noLimit });
  assert.equal(await c404.profile('00000001'), null);
  const c401 = createChClient({ apiKey: KEY, fetchImpl: fixtureFetch([{ match: /./, status: 401, json: { error: 'Invalid Authorization' } }]), limiter: noLimit });
  await assert.rejects(() => c401.profile('12345678'), /rejected the API key \(401\)/);
});

test('search with full profiles, fallback for missing profile', async () => {
  const f = fixtureFetch(routes);
  const c = createChClient({ apiKey: KEY, fetchImpl: f, limiter: noLimit });
  const out = [];
  for await (const r of c.search('example widgets', { maxResults: 10 })) out.push(r);
  assert.equal(out.length, 2);
  assert.equal(out[0].accounts.nextDue, '2026-12-31');
  assert.equal(out[1].companyNumber, '87654321');
  assert.ok(out[1].attribution);
});

test('advanced search builds filters and paginates', async () => {
  const f = fixtureFetch(routes);
  const c = createChClient({ apiKey: KEY, fetchImpl: f, limiter: noLimit });
  const out = [];
  for await (const r of c.advancedSearch({ sicCodes: ['62020'], incorporatedFrom: '2026-10-01', companyStatus: ['active'] }, { maxResults: 50 })) out.push(r);
  assert.equal(out.length, 2);
  assert.match(f.calls[0].url, /sic_codes=62020/);
  assert.match(f.calls[0].url, /incorporated_from=2026-10-01/);
  assert.ok(out.every((r) => r.attribution));
  await assert.rejects(async () => { for await (const _ of c.advancedSearch({})) { /* noop */ } }, /needs at least one filter/);
});
