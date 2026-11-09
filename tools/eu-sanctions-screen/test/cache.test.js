import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadSanctionsList,
  screenBatch,
  createKvsCacheStore,
  validateSanctionsPayload,
  SanctionsListError,
  NOT_LEGAL_ADVICE_DISCLAIMER,
  CACHE_META_KEY,
  _resetMemCache,
} from '../src/lib/sanctions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'sanctions_sample.csv'), 'utf8');
const [header, ...rows] = fixture.split(/\r?\n/).filter(Boolean);

// Build a synthetic but structurally valid CSV with n entities (fixture rows cloned with new logical IDs).
function bigCsv(n, genDate = '23/10/2026') {
  const cols = header.split(';');
  const idI = cols.indexOf('Entity_LogicalId');
  const gI = cols.indexOf('fileGenerationDate');
  const out = [header];
  out.push(...rows.map((r) => { const c = r.split(';'); c[gI] = genDate; return c.join(';'); }));
  const base = rows[0].split(';');
  for (let i = 0; i < n; i++) {
    const c = [...base];
    c[idI] = String(100000 + i);
    c[gI] = genDate;
    out.push(c.join(';'));
  }
  return out.join('\n');
}

function memKvs() {
  const m = new Map();
  return { m, async getValue(k) { return m.has(k) ? m.get(k) : null; }, async setValue(k, v) { m.set(k, v); } };
}

const resp = (status, body, headers = {}) => new Response(body, { status, headers });
const csvOk = (text) => () => resp(200, text, { 'content-type': 'text/plain' });
const fast = { retryDelaysMs: [0, 0, 0] };

beforeEach(() => _resetMemCache());

test('valid download is used (fresh) and seeds the persistent cache with metadata', async () => {
  const kvs = memKvs();
  const csv = bigCsv(3200);
  const index = await loadSanctionsList({ fetchImpl: csvOk(csv), cacheStores: [createKvsCacheStore(kvs)], ...fast });
  assert.equal(index.listFreshness.listStatus, 'fresh');
  assert.ok(index.totalEntities >= 3200);
  const meta = kvs.m.get(CACHE_META_KEY);
  assert.equal(meta.entityCount, index.totalEntities);
  assert.equal(meta.fileGenerationDate, '23/10/2026');
  assert.match(meta.sha256, /^[0-9a-f]{64}$/);
  assert.ok(meta.fetchedAt);
  const batch = screenBatch(index, ['Saddam Hussein Al-Tikriti']);
  assert.equal(batch.datasetRows[0].listStatus, 'fresh');
  assert.equal(batch.datasetRows[0].staleWarning, null);
});

test('HTTP 500 (after retries) falls back to the cache, marked stale everywhere', async () => {
  const kvs = memKvs();
  await loadSanctionsList({ fetchImpl: csvOk(bigCsv(3200)), cacheStores: [createKvsCacheStore(kvs)], ...fast });
  _resetMemCache();
  let calls = 0;
  const index = await loadSanctionsList({ fetchImpl: () => { calls++; return resp(500, 'err'); }, cacheStores: [createKvsCacheStore(kvs)], ...fast });
  assert.equal(calls, 4, '1 attempt + 3 retries');
  assert.equal(index.listFreshness.listStatus, 'stale');
  assert.match(index.listFreshness.upstreamError, /HTTP 500/);
  const batch = screenBatch(index, ['Saddam Hussein Al-Tikriti', 'Clean Nordic Company Oy']);
  for (const row of batch.datasetRows) {
    assert.equal(row.listStatus, 'stale');
    assert.match(row.staleWarning, /NOT included/);
    assert.match(row.staleWarning, /23\/10\/2026/);
    assert.equal(row.disclaimer, NOT_LEGAL_ADVICE_DISCLAIMER);
    assert.ok(row.attribution.includes('Decision 2011/833/EU'));
    assert.ok(row.listFetchedAt);
    assert.equal(typeof row.listAgeHours, 'number');
  }
  assert.equal(batch.listStatus, 'stale');
});

test('307 redirect to sorry.ec.europa.eu is never followed/parsed/cached; cache is served', async () => {
  const kvs = memKvs();
  await loadSanctionsList({ fetchImpl: csvOk(bigCsv(3200)), cacheStores: [createKvsCacheStore(kvs)], ...fast });
  const before = kvs.m.get(CACHE_META_KEY);
  _resetMemCache();
  const seen = [];
  const fetchImpl = (url) => {
    seen.push(url);
    if (url.includes('sorry.ec.europa.eu')) return resp(200, '<!DOCTYPE html><html>Server temporarily unavailable</html>', { 'content-type': 'text/html' });
    return resp(307, null, { location: 'https://sorry.ec.europa.eu/index.html', 'set-cookie': 'a=1; Path=/' });
  };
  const index = await loadSanctionsList({ fetchImpl, cacheStores: [createKvsCacheStore(kvs)], ...fast });
  assert.equal(index.listFreshness.listStatus, 'stale');
  assert.match(index.listFreshness.upstreamError, /maintenance page/);
  assert.ok(!seen.some((u) => u.includes('sorry.')), 'sorry page must not be fetched');
  assert.deepEqual(kvs.m.get(CACHE_META_KEY), before, 'cache untouched');
});

test('200 HTML maintenance page served directly is rejected and cache is served', async () => {
  const kvs = memKvs();
  await loadSanctionsList({ fetchImpl: csvOk(bigCsv(3200)), cacheStores: [createKvsCacheStore(kvs)], ...fast });
  _resetMemCache();
  const index = await loadSanctionsList({
    fetchImpl: () => resp(200, '<html><body>Server temporarily unavailable</body></html>', { 'content-type': 'text/html;charset=UTF-8' }),
    cacheStores: [createKvsCacheStore(kvs)],
    ...fast,
  });
  assert.equal(index.listFreshness.listStatus, 'stale');
  assert.match(index.listFreshness.upstreamError, /HTML/);
  assert.throws(() => validateSanctionsPayload({ text: '<html></html>', contentType: 'text/plain' }), SanctionsListError);
});

test('implausibly small file is rejected and not cached', async () => {
  const kvs = memKvs();
  await loadSanctionsList({ fetchImpl: csvOk(bigCsv(3200)), cacheStores: [createKvsCacheStore(kvs)], ...fast });
  const before = kvs.m.get(CACHE_META_KEY);
  _resetMemCache();
  const index = await loadSanctionsList({ fetchImpl: csvOk(bigCsv(1000, '09/11/2026')), cacheStores: [createKvsCacheStore(kvs)], ...fast });
  assert.equal(index.listFreshness.listStatus, 'stale');
  assert.match(index.listFreshness.upstreamError, /implausibly small/);
  assert.deepEqual(kvs.m.get(CACHE_META_KEY), before);
  // with no cache, the fixed floor applies
  _resetMemCache();
  await assert.rejects(
    loadSanctionsList({ fetchImpl: csvOk(fixture), cacheStores: [createKvsCacheStore(memKvs())], ...fast }),
    /no previously downloaded copy is cached/
  );
});

test('no cache + upstream down fails with a clear error', async () => {
  await assert.rejects(
    loadSanctionsList({ fetchImpl: () => resp(500, 'x'), cacheStores: [createKvsCacheStore(memKvs())], ...fast }),
    (e) => e instanceof SanctionsListError && e.kind === 'no-cache' && /HTTP 500/.test(e.message) && /retry later/.test(e.message)
  );
});

test('falls back to a read-only seed store when the primary store is empty', async () => {
  const seedKvs = memKvs();
  await loadSanctionsList({ fetchImpl: csvOk(bigCsv(3200)), cacheStores: [createKvsCacheStore(seedKvs)], ...fast });
  _resetMemCache();
  const seed = { ...createKvsCacheStore(seedKvs, 'seed'), readOnly: true };
  const primaryKvs = memKvs();
  const index = await loadSanctionsList({ fetchImpl: () => resp(500, 'x'), cacheStores: [createKvsCacheStore(primaryKvs), seed], ...fast });
  assert.equal(index.listFreshness.listStatus, 'stale');
  assert.equal(primaryKvs.m.size, 0);
  // a later successful download writes the primary store
  _resetMemCache();
  await loadSanctionsList({ fetchImpl: csvOk(bigCsv(3200)), cacheStores: [createKvsCacheStore(primaryKvs), seed], ...fast });
  assert.ok(primaryKvs.m.get(CACHE_META_KEY));
});
