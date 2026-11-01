import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTedbClient, buildRequest, parseResponse, normaliseCountry, summarise, tedbAttribution } from '../src/lib/tedb.js';

const fx = (f) => readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', f), 'utf8');
const noLimit = (fn) => fn();
function xmlFetch(pick) {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, body: init.body, headers: init.headers });
    const { file, status = 200 } = pick(init.body);
    return new Response(fx(file), { status, headers: { 'content-type': 'text/xml' } });
  };
  f.calls = calls;
  return f;
}

test('country normalisation', () => {
  assert.equal(normaliseCountry('gr'), 'EL');
  assert.equal(normaliseCountry('FI'), 'FI');
  assert.equal(normaliseCountry('XI'), 'XI');
  assert.throws(() => normaliseCountry('NO'), /Unknown EU member state/);
});

test('request envelope is well-formed and escaped', () => {
  const x = buildRequest({ countries: ['FI', 'DE'], date: '2026-11-01', cnCodes: ['4901'], cpaCodes: [], categories: ['A&B'] });
  assert.match(x, /<urn1:isoCode>FI<\/urn1:isoCode><urn1:isoCode>DE<\/urn1:isoCode>/);
  assert.match(x, /<urn1:situationOn>2026-11-01<\/urn1:situationOn>/);
  assert.match(x, /<urn1:cnCodes><urn1:value>4901<\/urn1:value><\/urn1:cnCodes>/);
  assert.match(x, /A&amp;B/);
});

test('parse + summarise FI/ES/EL', () => {
  const rows = parseResponse(fx('fi_es_el.xml'));
  assert.ok(rows.length > 50);
  const s = summarise(rows, ['FI', 'ES', 'EL']);
  const fi = s.find((x) => x.country === 'FI');
  assert.equal(fi.standardRate, 25.5);
  assert.ok(fi.reducedRates.includes(13.5) && fi.reducedRates.includes(10));
  const es = s.find((x) => x.country === 'ES');
  assert.equal(es.standardRate, 21);
  assert.ok(es.regionalStandardRates.some((r) => /Canary/.test(r.note)));
  assert.equal(s.find((x) => x.country === 'EL').standardRate, 24);
});

test('SOAP fault surfaces readable error without retry', async () => {
  const f = xmlFetch(() => ({ file: 'fault.xml', status: 500 }));
  const c = createTedbClient({ fetchImpl: f, limiter: noLimit });
  await assert.rejects(() => c.standardRates({ countries: ['FI'], date: '2026-11-01' }), /TEDB fault: .*Request is not valid/);
  assert.equal(f.calls.length, 1);
});

test('lookup by CN code with standard fallback + cache', async () => {
  const f = xmlFetch((body) => ({ file: body.includes('<urn1:cnCodes>') ? 'fi_de_4901.xml' : 'fi_es_el.xml' }));
  const c = createTedbClient({ fetchImpl: f, limiter: noLimit });
  const r = await c.lookup({ countries: ['FI', 'DE'], date: '2026-11-01', cnCodes: ['4901'] });
  assert.ok(r.rows.length >= 1);
  assert.ok(r.rows.every((x) => ['FI', 'DE'].includes(x.country)));
  assert.ok(r.rows.some((x) => x.cnCodes.some((c) => c.code.startsWith('4901'))));
  assert.equal(f.calls[0].headers.soapaction.includes('RetrieveVatRates'), true);
  const n = f.calls.length;
  await c.lookup({ countries: ['FI', 'DE'], date: '2026-11-01', cnCodes: ['4901'] });
  assert.equal(f.calls.length, n, 'second call served from cache');
  await assert.rejects(() => c.lookup({ countries: ['FI'] }), /Provide at least one/);
});

test('attribution', () => {
  const a = tedbAttribution();
  assert.match(a.licence, /CC BY 4\.0|Creative Commons Attribution 4\.0/);
  assert.match(a.attribution, /TEDB/);
});
