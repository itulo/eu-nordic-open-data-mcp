import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchEventsNo, watchCompaniesNo, lookupNo, classifyUpdate, companyLevelNo, NO_DEFAULT_EVENTS } from '../src/lib/brreg.js';
import { fixtureFetch, licences } from '../src/lib/common.js';

const fx = (f) => path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', f);
const ENT = JSON.parse(readFileSync(fx('brreg_entities.json'), 'utf8'));
const ATTR = licences().sources.brreg.attribution;
const routes = [
  { match: /\/enheter\?fraRegistreringsdato/, file: fx('brreg_new.json') },
  { match: /\/oppdateringer\/enheter\?/, file: fx('brreg_updates.json') },
  { match: /\/enheter\/(\d{9})$/, json: (u) => ENT[u.match(/(\d{9})$/)[1]] || { feilmelding: 'not found' }, status: 200 },
];
const ALL = ['new_company', 'name_change', 'liquidation', 'bankruptcy', 'dissolution', 'removal', 'registered_office_change', 'industry_change'];
const FORBIDDEN = ['aktivitet', 'epostadresse', 'telefon', 'mobil', 'adresse', 'roller', 'postadresse', 'forretningsadresse'];
function deepKeys(o, acc = new Set()) { if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { acc.add(k); deepKeys(v, acc); } return acc; }

test('classifyUpdate maps Brreg JSON-patch changes to event types', () => {
  assert.deepEqual([...classifyUpdate({ endringstype: 'Endring', endringer: [{ op: 'replace', path: '/navn', value: 'X AS' }] })], ['name_change']);
  assert.ok(classifyUpdate({ endringstype: 'Endring', endringer: [{ op: 'replace', path: '/konkurs', value: true }] }).has('bankruptcy'));
  assert.ok(classifyUpdate({ endringstype: 'Sletting' }).has('removal'));
  assert.ok(classifyUpdate({ endringstype: 'Endring', endringer: [{ op: 'replace', path: '/forretningsadresse/kommunenummer', value: '0301' }] }).has('registered_office_change'));
  assert.equal(classifyUpdate({ endringstype: 'Endring', endringer: [{ op: 'replace', path: '/konkurs', value: false }] }).size, 0);
});

test('fetchEventsNo: all supported types, ENK dropped, company-level only, attribution (fixtures)', async () => {
  const f = fixtureFetch(routes);
  const { records, stats } = await fetchEventsNo({ eventTypes: [...ALL, 'restructuring'], dateFrom: '2026-10-30', dateTo: '2026-10-30' }, { fetchImpl: f });
  const types = new Set(records.map((r) => r.eventType));
  for (const t of ['new_company', 'name_change', 'liquidation', 'removal', 'registered_office_change', 'industry_change']) assert.ok(types.has(t), t);
  assert.deepEqual(stats.unsupportedInNorway, ['restructuring']);
  assert.equal(stats.excludedPersonEntities, 2, 'one ENK in new-company search, one ENK in the update feed');
  assert.ok(!records.some((r) => ['838737102', '922868034'].includes(r.businessId)), 'ENK must not appear');
  for (const r of records) {
    assert.equal(r.attribution, ATTR);
    assert.equal(r.country, 'NO');
    assert.match(r.businessId, /^\d{9}$/);
    assert.notEqual(r.companyForm?.code, 'ENK');
    const keys = deepKeys(r);
    for (const k of FORBIDDEN) assert.ok(!keys.has(k), `forbidden key ${k}`);
  }
  const nc = records.find((r) => r.eventType === 'name_change');
  assert.equal(nc.previousName, 'NFH 260817 AS');
  const rm = records.find((r) => r.eventType === 'removal');
  assert.equal(rm.status, 'deleted');
  assert.equal(rm.eventDate, '2026-10-30');
  assert.ok(!f.calls.some((c) => /roller/.test(c.url)), '/roller must never be called');
});

test('fetchEventsNo: default event list, maxPerEvent and location/form filters', async () => {
  assert.ok(!NO_DEFAULT_EVENTS.includes('restructuring'));
  const f = fixtureFetch(routes);
  const { records } = await fetchEventsNo({ eventTypes: ['new_company'], dateFrom: '2026-10-30', dateTo: '2026-10-30', maxPerEvent: 2 }, { fetchImpl: f });
  assert.equal(records.length, 2);
  const g = fixtureFetch(routes);
  const r2 = await fetchEventsNo({ eventTypes: ['name_change', 'liquidation'], dateFrom: '2026-10-30', dateTo: '2026-10-30', location: 'oslo' }, { fetchImpl: g });
  assert.ok(r2.records.every((r) => r.location.city === 'OSLO'));
  await assert.rejects(() => fetchEventsNo({ dateFrom: '2026-10-31', dateTo: '2026-10-30' }, { fetchImpl: g }));
});

test('watchCompaniesNo diffs snapshots and withholds ENK; lookupNo', async () => {
  const f = fixtureFetch(routes);
  const first = await watchCompaniesNo(['938481784', '922868034'], {}, { fetchImpl: f });
  assert.equal(first.records.length, 0);
  assert.equal(first.excludedPersonEntities, 1);
  const prev = { '938481784': { ...first.snapshots['938481784'], companyName: 'NFH 260817 AS' } };
  const second = await watchCompaniesNo(['NO 938 481 784 MVA'], prev, { fetchImpl: f });
  assert.equal(second.records[0].eventType, 'name_change');
  assert.equal(second.records[0].previousName, 'NFH 260817 AS');
  await assert.rejects(() => watchCompaniesNo(['1234567-8'], {}, { fetchImpl: f }), /9 digits/);
  const l = await lookupNo('922868034', { fetchImpl: f });
  assert.equal(l.withheld, true);
  assert.equal(companyLevelNo(ENT['956886309']).situations[0].type, 'UNDER_AVVIKLING');
});
