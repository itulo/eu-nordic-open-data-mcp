import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, runMode, toRecord, latestPerDataset, cheapHourSignal, co2Signal, DATASETS, GROUPS, MissingApiKeyError, helsinkiTime } from '../src/lib/fingrid.js';
import { fixtureFetch, licences } from '../src/lib/common.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const fx = (...p) => path.join(dir, 'fixtures', ...p);
const ATTR = 'Source Fingrid / data.fingrid.fi, license CC 4.0 BY';
const recorded = readdirSync(fx('recorded')).map((f) => JSON.parse(readFileSync(fx('recorded', f), 'utf8')));
const recordedRows = recorded.flatMap((r) => r.response.data);
const forecasts = JSON.parse(readFileSync(fx('synthetic', 'forecasts_48h.json'), 'utf8'));
const co2 = JSON.parse(readFileSync(fx('synthetic', 'co2_24h.json'), 'utf8'));

test('licence register attribution is Fingrid exact wording', () => {
  assert.equal(licences().sources.fingrid.attribution, ATTR);
});

test('client requires API key', () => {
  assert.throws(() => createClient({ apiKey: '' }), MissingApiKeyError);
});

test('client sends key in header (not URL), uses multi-dataset endpoint and follows pagination', async () => {
  const f = fixtureFetch([{ match: /\/api\/data\?/, json: (url) => (new URL(url).searchParams.get('page') === '1' ? { data: recordedRows.slice(0, 10), pagination: { nextPage: 2 } } : { data: recordedRows.slice(10, 20), pagination: { nextPage: null } }) }]);
  const c = createClient({ apiKey: 'TESTKEY', fetchImpl: f, minIntervalMs: 0 });
  const t0 = Date.now();
  const rows = await c.timeseries([193, 192], { startTime: '2026-10-11T10:00:00Z', endTime: '2026-10-11T12:00:00Z' });
  assert.equal(rows.length, 20);
  assert.equal(f.calls.length, 2);
  const u = new URL(f.calls[0].url);
  assert.equal(u.origin + u.pathname, 'https://data.fingrid.fi/api/data');
  assert.equal(u.searchParams.get('datasets'), '193,192');
  assert.ok(!f.calls[0].url.includes('TESTKEY'), 'key must not be in URL');
  assert.equal(f.calls[0].init.headers['x-api-key'], 'TESTKEY');
});

test('recorded fixtures: every curated dataset id exists, records carry attribution + source link', () => {
  for (const r of recorded) {
    assert.ok(DATASETS[r.meta.id], `dataset ${r.meta.id} curated`);
    assert.equal(r.meta.organization, 'Fingrid');
    assert.match(r.meta.license.name, /Creative Commons Attribution/);
    assert.equal(r.meta.unitEn.replace('€', 'EUR'), DATASETS[r.meta.id].unit, `unit ${r.meta.id}`);
  }
  for (const row of recordedRows) {
    const rec = toRecord(row);
    assert.equal(rec.attribution, ATTR);
    assert.equal(rec.sourceUrl, `https://data.fingrid.fi/en/datasets/${row.datasetId}`);
    assert.equal(rec.licenceUrl, 'https://creativecommons.org/licenses/by/4.0/');
  }
  const latest = latestPerDataset(recordedRows);
  assert.equal(latest.length, new Set(recordedRows.map((r) => r.datasetId)).size);
});

test('cheap-hour signal ranks by residual load, flags topN, marks modification', () => {
  const now = new Date('2026-10-11T12:00:00Z');
  const s = cheapHourSignal(forecasts.data, { topN: 6, now });
  assert.equal(s.length, 48);
  assert.equal(s.filter((x) => x.isCheapHourCandidate).length, 6);
  const best = s.find((x) => x.rank === 1);
  assert.ok(s.every((x) => x.residualLoadMW >= best.residualLoadMW));
  assert.equal(best.score, 100);
  for (const x of s) {
    assert.equal(x.attribution, ATTR);
    assert.equal(x.modified, true);
    assert.match(x.modificationNotice, /data\.fingrid\.fi\/en\/datasets\/166/);
    assert.match(x.modificationNotice, /no electricity exchange price/);
    assert.deepEqual(x.basisDatasets, [166, 245, 248]);
  }
  assert.equal(s[0].hourStartHelsinki, '2026-10-11T15:00');
});

test('co2 signal classifies current level', () => {
  const s = co2Signal(co2.data);
  assert.equal(s.observations, 96);
  assert.ok(['low', 'medium', 'high'].includes(s.level));
  assert.equal(s.attribution, ATTR);
  assert.equal(s.nonFossilSharePct, 95);
  assert.equal(co2Signal([]), null);
});

test('runMode uses only data.fingrid.fi and handles all modes (fixtures)', async () => {
  const f = fixtureFetch([
    { match: (u) => u.includes('datasets=166%2C245%2C248'), json: forecasts },
    { match: (u) => u.includes('datasets=396%2C395'), json: co2 },
    { match: /\/api\/datasets\/9999$/, json: { id: 9999, organization: 'Other TSO', license: { name: 'Other licence' } } },
    { match: /\/api\/data\?/, json: { data: recordedRows, pagination: {} } },
  ]);
  const client = createClient({ apiKey: 'K', fetchImpl: f, minIntervalMs: 0 });
  const now = new Date('2026-10-11T12:00:00Z');
  const snap = await runMode('grid_snapshot', { client, now });
  assert.ok(snap.length > 5 && snap.every((r) => r.attribution === ATTR));
  assert.equal((await runMode('cheap_hours', { client, now })).length, 48);
  assert.equal((await runMode('co2', { client, now }))[0].signal, 'co2_intensity');
  for (const g of Object.keys(GROUPS)) assert.ok((await runMode(g, { client, now })).every((r) => r.attribution === ATTR));
  await assert.rejects(runMode('custom', { client, datasetIds: [9999], now }), /not a Fingrid CC BY dataset/);
  await assert.rejects(runMode('nordpool_prices', { client, now }), /Unknown mode/);
  assert.ok(f.calls.every((c) => c.url.startsWith('https://data.fingrid.fi/api/')), 'only Fingrid API is called');
});

test('no Nord Pool / exchange price source anywhere in the code', () => {
  const src = path.join(dir, '..', 'src');
  const files = ['main.js', 'mcp-server.js', 'lib/fingrid.js', 'lib/common.js'];
  for (const f of files) {
    const code = readFileSync(path.join(src, f), 'utf8');
    assert.ok(!/nordpool(group)?\.com|elspot|entsoe\.eu.*A44|day-ahead price/i.test(code.replace(/\/\/.*$/gm, '')), f);
  }
  assert.equal(helsinkiTime('2026-01-15T10:00:00Z'), '2026-01-15T12:00');
});

test('production limiter spaces requests >= 2 s (Fingrid: 1 request / 2 s)', async () => {
  const f = fixtureFetch([{ match: /\/api\/data\?/, json: { data: [], pagination: {} } }]);
  const c = createClient({ apiKey: 'K', fetchImpl: f });
  const t0 = Date.now();
  await c.timeseries([193]); await c.timeseries([193]);
  assert.ok(Date.now() - t0 >= 2000, `spacing ${Date.now() - t0}ms`);
});
