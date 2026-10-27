import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildQuery, normaliseNotice, dedupe, searchTenders, filterNew, alertWindow, normaliseCpv, normaliseCountry } from '../src/lib/ted.js';
import { fixtureFetch, licences } from '../src/lib/common.js';

const fx = (f) => path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', f);
const p1 = JSON.parse(readFileSync(fx('ted_search_p1.json'), 'utf8'));
const p2 = JSON.parse(readFileSync(fx('ted_search_p2.json'), 'utf8'));
const ATTR = licences().sources.ted.attribution;

test('buildQuery validates and builds expert query', () => {
  const q = buildQuery({ cpvCodes: ['72000000-5', '48000000'], countries: ['FI', 'swe'], publishedFrom: '2026-10-01', publishedTo: '2026-10-09', noticeTypes: ['competition'] });
  assert.match(q, /^classification-cpv IN \(72000000 48000000\) AND organisation-country-buyer IN \(FIN SWE\) AND publication-date>=20261001 AND publication-date<=20261009 AND notice-type IN \(cn-standard /);
  assert.throws(() => buildQuery({ cpvCodes: ['72'] }), /Invalid CPV/);
  assert.throws(() => buildQuery({ countries: ['XX'] }), /Unknown country/);
  assert.throws(() => buildQuery({ publishedFrom: '1.10.2026' }), /Invalid date/);
  assert.throws(() => buildQuery({ noticeTypes: ['cn) OR (x'] }), /Invalid notice type/);
  assert.throws(() => buildQuery({}), /At least one filter/);
  assert.equal(normaliseCpv('72000000-5'), '72000000');
  assert.equal(normaliseCountry('fi'), 'FIN');
  assert.match(buildQuery({ countries: ['FI'], countryField: 'performance' }), /place-of-performance IN \(FIN\)/);
});

test('normaliseNotice produces structured organisation-level record with attribution', () => {
  const r = normaliseNotice(p1.notices[0]);
  assert.ok(r.publicationNumber);
  assert.equal(r.attribution, ATTR);
  assert.ok(r.licenceUrl.startsWith('https://ted.europa.eu'));
  assert.ok(Array.isArray(r.cpvCodes) && r.cpvCodes.length > 0);
  assert.equal(new Set(r.cpvCodes).size, r.cpvCodes.length, 'cpv codes are unique');
  assert.match(r.publicationDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(r.url.includes(r.publicationNumber));
  // GDPR minimisation: no person/contact fields
  const s = JSON.stringify(r).toLowerCase();
  for (const k of ['contact', 'email', 'phone', 'winner', 'tenderer']) assert.ok(!Object.keys(r).some((x) => x.toLowerCase().includes(k)), k);
  assert.ok(!s.includes('@'), 'no e-mail addresses');
});

test('every fixture notice normalises and has attribution', () => {
  for (const n of [...p1.notices, ...p2.notices]) {
    const r = normaliseNotice(n);
    assert.equal(r.attribution, ATTR);
    assert.ok(r.title, `title for ${r.publicationNumber}`);
  }
});

test('dedupe removes duplicate publication numbers and can collapse by procedure', () => {
  const recs = [...p1.notices, ...p1.notices.slice(0, 3)].map((n) => normaliseNotice(n));
  assert.equal(dedupe(recs).length, p1.notices.length);
  const a = { publicationNumber: '1-2026', procedureId: 'P' }, b = { publicationNumber: '5-2026', procedureId: 'P' }, c = { publicationNumber: '3-2026', procedureId: 'Q' };
  const out = dedupe([a, b, c], { collapseByProcedure: true });
  assert.equal(out.length, 2);
  const p = out.find((x) => x.procedureId === 'P');
  assert.equal(p.publicationNumber, '5-2026');
  assert.deepEqual(p.relatedPublicationNumbers, ['1-2026']);
});

test('searchTenders paginates with iteration token (fixtures)', async () => {
  let n = 0;
  const f = fixtureFetch([{ match: /notices\/search/, json: (url, init) => { n++; const b = JSON.parse(init.body); return b.iterationNextToken ? { ...p2, iterationNextToken: null } : p1; } }]);
  const r = await searchTenders({ cpvCodes: ['72000000'], countries: ['FI'], publishedFrom: '2026-10-01', maxResults: 24 }, { fetchImpl: f, pageSize: 12 });
  assert.equal(n, 2);
  assert.equal(r.records.length, 24);
  assert.equal(r.total, p1.totalNoticeCount);
  const body = JSON.parse(f.calls[0].init.body);
  assert.ok(body.fields.includes('notice-title'));
  assert.ok(!body.fields.some((x) => /contact|winner|email|phone/.test(x)), 'never request personal fields');
});

test('searchTenders surfaces API errors', async () => {
  const f = fixtureFetch([{ match: /search/, file: fx('ted_error_400.json'), status: 400 }]);
  await assert.rejects(searchTenders({ cpvCodes: ['72000000'] }, { fetchImpl: f }), /HTTP 400/);
});

test('alert mode returns only unseen notices and prunes old state', () => {
  const recs = p1.notices.map((n) => normaliseNotice(n));
  const first = filterNew(recs, {});
  assert.equal(first.fresh.length, recs.length);
  const second = filterNew(recs, first.state);
  assert.equal(second.fresh.length, 0);
  const third = filterNew([...recs, { publicationNumber: '999999-2026' }], second.state);
  assert.deepEqual(third.fresh.map((r) => r.publicationNumber), ['999999-2026']);
  const pruned = filterNew([], { seen: { 'old-1': '2020-01-01' } }, { now: new Date('2026-10-11') });
  assert.equal(pruned.state.seen['old-1'], undefined);
  const w = alertWindow({ lastRunAt: '2026-10-10T06:00:00Z' }, new Date('2026-10-11T06:00:00Z'));
  assert.deepEqual(w, { publishedFrom: '2026-10-07', publishedTo: '2026-10-11' });
});
