import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchEvents, companyLevel, watchCompanies, filterNewEvents, defaultWindow, PERSON_ENTRY_CODES } from '../src/lib/prh.js';
import { fixtureFetch, licences } from '../src/lib/common.js';

const fx = (f) => path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', f);
const load = (f) => JSON.parse(readFileSync(fx(f), 'utf8'));
const ATTR = licences().sources.prh.attribution;
const routes = [
  { match: /opendata-ytj-api\/v3\/companies\?registrationDateStart/, file: fx('ytj_new_companies.json') },
  ...['TMI', 'SELAS', 'KONALK', 'LAKK'].map((c) => ({ match: new RegExp(`entryCode=${c}&`), file: fx(`krek_${c}.json`) })),
  { match: /registerednotices-api\/v3\/\?/, json: { totalResults: 0, companies: [] } },
];
const FORBIDDEN_KEYS = ['co', 'street', 'buildingNumber', 'entrance', 'apartmentNumber', 'apartmentIdSuffix', 'postOfficeBox', 'freeAddressLine', 'persons', 'roles'];
function deepKeys(o, acc = new Set()) { if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { acc.add(k); deepKeys(v, acc); } return acc; }

test('companyLevel strips c/o names and street-level address (GDPR minimisation)', () => {
  const raw = load('ytj_new_companies.json').companies[0];
  assert.match(raw.addresses[0].co, /Matti/, 'fixture contains a synthetic person name');
  const out = companyLevel(raw);
  const s = JSON.stringify(out);
  assert.ok(!s.includes('Matti'), 'person name must not leak');
  assert.ok(!s.includes('Fixturekatu'), 'street must not leak');
  const keys = deepKeys(out);
  for (const k of FORBIDDEN_KEYS) assert.ok(!keys.has(k), `forbidden key ${k}`);
  assert.ok(out.location.postCode && out.location.city);
});

test('fetchEvents builds all requested event types with attribution (fixtures)', async () => {
  const f = fixtureFetch(routes);
  const { records, stats } = await fetchEvents({ eventTypes: ['new_company', 'name_change', 'liquidation', 'bankruptcy', 'dissolution', 'industry_change'], dateFrom: '2026-10-08', dateTo: '2026-10-08' }, { fetchImpl: f });
  const types = new Set(records.map((r) => r.eventType));
  for (const t of ['new_company', 'name_change', 'liquidation', 'bankruptcy', 'dissolution']) assert.ok(types.has(t), t);
  assert.equal(stats.liquidation.fetched, 8);
  for (const r of records) {
    assert.equal(r.attribution, ATTR);
    assert.match(r.businessId, /^\d{7}-\d$/);
    assert.ok(r.eventDate);
    assert.ok(r.entryCodes.every((c) => !PERSON_ENTRY_CODES.has(c)), 'person-related entry codes removed');
    const keys = deepKeys(r);
    for (const k of FORBIDDEN_KEYS) assert.ok(!keys.has(k), `forbidden key ${k}`);
  }
  assert.ok(!JSON.stringify(records).includes('Matti'));
  const nc = records.find((r) => r.eventType === 'name_change' && r.businessId === '0892215-7');
  assert.equal(nc.companyName, 'Pelti- ja Rautatyö Salminen Oy');
  assert.equal(nc.previousName, 'Pelti- ja Rautatyö E. Salminen Oy');
  assert.equal(new Set(records.map((r) => r.eventKey)).size, records.length, 'deduplicated');
  assert.ok(f.calls.every((c) => c.url.includes('page=1')), 'fixture totals fit in one page');
});

test('fetchEvents validates input', async () => {
  await assert.rejects(fetchEvents({ dateFrom: '2026-10-08' }), /required/);
  await assert.rejects(fetchEvents({ dateFrom: '2026-10-09', dateTo: '2026-10-08' }), /<=/);
  await assert.rejects(fetchEvents({ eventTypes: ['board_changes'], dateFrom: '2026-10-08', dateTo: '2026-10-08' }), /Unknown event type/);
});

test('watchlist diff emits name/industry changes and no person data', async () => {
  const c = structuredClone(load('krek_TMI.json').companies[0]);
  const id = c.businessId.value;
  const f1 = fixtureFetch([{ match: /businessId=/, json: { totalResults: 1, companies: [c] } }]);
  const first = await watchCompanies([id], {}, { fetchImpl: f1 });
  assert.equal(first.records.length, 0);
  assert.deepEqual(first.firstSeen, [id]);
  const c2 = structuredClone(c);
  c2.names[0].name = 'Renamed Oy';
  c2.mainBusinessLine.type = '62010';
  const f2 = fixtureFetch([{ match: /businessId=/, json: { totalResults: 1, companies: [c2] } }]);
  const second = await watchCompanies([id], first.snapshots, { fetchImpl: f2 });
  const evs = second.records.map((r) => r.eventType).sort();
  assert.deepEqual(evs, ['industry_change', 'name_change']);
  assert.equal(second.records.find((r) => r.eventType === 'name_change').previousName, 'Pelti- ja Rautatyö Salminen Oy');
  assert.ok(second.records.every((r) => r.attribution === ATTR));
  await assert.rejects(watchCompanies(['123'], {}), /Invalid Business ID/);
});

test('alert filtering and default window', () => {
  const recs = [{ eventKey: 'a' }, { eventKey: 'b' }];
  const s1 = filterNewEvents(recs, {});
  assert.equal(s1.fresh.length, 2);
  assert.equal(filterNewEvents(recs, s1.state).fresh.length, 0);
  assert.deepEqual(defaultWindow({}, new Date('2026-10-11T10:00:00Z')), { dateFrom: '2026-10-10', dateTo: '2026-10-10' });
  assert.deepEqual(defaultWindow({ lastRunAt: '2026-10-09T10:00:00Z' }, new Date('2026-10-11T10:00:00Z')), { dateFrom: '2026-10-07', dateTo: '2026-10-10' });
});
