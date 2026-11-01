import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtureFetch } from '../src/lib/common.js';
import { createGleifClient, normaliseLei, leiChecksumOk, mapRecord, gleifAttribution } from '../src/lib/gleif.js';

const fx = (f) => path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', f);
const noLimit = (fn) => fn();
const NSN = '549300FI8QIVYMUMBB43';
const NOKIA = '549300A0JPRWG1KI7U06';

test('LEI checksum validation', () => {
  assert.equal(leiChecksumOk(NOKIA), true);
  assert.equal(leiChecksumOk(NSN), true);
  assert.throws(() => normaliseLei('549300A0JPRWG1KI7U07'), /check digits/);
  assert.throws(() => normaliseLei('abc'), /Invalid LEI/);
  assert.equal(normaliseLei(' 549300a0jprwg1ki7u06 '), NOKIA);
});

test('lookup maps company-level fields and no mapping identifiers', async () => {
  const f = fixtureFetch([{ match: new RegExp(`/lei-records/${NSN}$`), file: fx('nsn.json') }]);
  const c = createGleifClient({ fetchImpl: f, limiter: noLimit });
  const r = await c.lookup(NSN);
  assert.equal(r.found, true);
  assert.equal(r.lei, NSN);
  assert.match(r.legalName, /Nokia Solutions and Networks/);
  assert.equal(r.legalAddress.country, 'FI');
  assert.ok(r.registration.status);
  const s = JSON.stringify(r);
  for (const k of ['bic', 'isin', 'ocid', 'spglobal', 'qcc']) assert.ok(!s.includes(`"${k}"`), k);
});

test('lookup returns found:false on 404', async () => {
  const f = fixtureFetch([]);
  const c = createGleifClient({ fetchImpl: f, limiter: noLimit });
  assert.deepEqual(await c.lookup(NOKIA), { lei: NOKIA, found: false });
});

test('sole proprietor records are withheld', async () => {
  const sole = (await import('node:fs')).readFileSync(fx('sole.json'), 'utf8');
  const rec = JSON.parse(sole).data[0];
  const m = mapRecord(rec);
  assert.equal(m.withheld, true);
  assert.equal(m.legalName, undefined);
  assert.equal(m.legalAddress, undefined);
});

test('ownership chain: direct + ultimate parent resolved to Nokia Oyj', async () => {
  const f = fixtureFetch([
    { match: new RegExp(`/lei-records/${NSN}/direct-parent-relationship$`), file: fx('nsn_dp_rel.json') },
    { match: new RegExp(`/lei-records/${NSN}/ultimate-parent-relationship$`), file: fx('nsn_up_rel.json') },
    { match: new RegExp(`/lei-records/${NSN}/direct-children`), file: fx('nsn_children.json') },
    { match: /filter\[lei\]=549300A0JPRWG1KI7U06/, file: fx('nokia_batch.json') },
    { match: new RegExp(`/lei-records/${NSN}$`), file: fx('nsn.json') },
  ]);
  const c = createGleifClient({ fetchImpl: f, limiter: noLimit });
  const o = await c.ownership(NSN);
  assert.equal(o.directParent.parentLei, NOKIA);
  assert.equal(o.directParent.relationshipType, 'IS_DIRECTLY_CONSOLIDATED_BY');
  assert.equal(o.directParent.parent.legalName, 'Nokia Oyj');
  assert.equal(o.ultimateParent.parentLei, NOKIA);
  assert.equal(o.directChildrenCount, 3);
});

test('ownership chain: reporting exception for top parent', async () => {
  const f = fixtureFetch([
    { match: /direct-parent-reporting-exception$/, file: fx('nokia_dp_exc.json') },
    { match: /ultimate-parent-reporting-exception$/, file: fx('nokia_dp_exc.json') },
    { match: /-relationship$/, status: 404, json: { errors: [{ status: '404' }] } },
    { match: /direct-children/, file: fx('nsn_children.json') },
    { match: new RegExp(`/lei-records/${NOKIA}$`), json: JSON.parse((await import('node:fs')).readFileSync(fx('nokia_batch.json'), 'utf8')).data[0] && { data: JSON.parse((await import('node:fs')).readFileSync(fx('nokia_batch.json'), 'utf8')).data[0] } },
  ]);
  const c = createGleifClient({ fetchImpl: f, limiter: noLimit });
  const o = await c.ownership(NOKIA);
  assert.equal(o.entity.legalName, 'Nokia Oyj');
  assert.equal(o.directParent.reportingException, true);
  assert.equal(o.directParent.reason, 'NON_CONSOLIDATING');
  assert.ok(o.directParent.explanation);
});

test('search by name and by register number', async () => {
  const f = fixtureFetch([
    { match: /filter\[entity\.names\]=nokia/, file: fx('search_nokia.json') },
    { match: /filter\[entity\.registeredAs\]=0112038-9/, file: fx('regas.json') },
  ]);
  const c = createGleifClient({ fetchImpl: f, limiter: noLimit });
  const s = await c.search({ name: 'nokia', country: 'fi', limit: 5 });
  assert.ok(s.count >= 1);
  assert.ok(s.results.some((r) => r.legalName === 'Nokia Oyj'));
  assert.match(f.calls[0].url, /filter\[entity\.legalAddress\.country\]=FI/);
  const r = await c.search({ registeredAs: '0112038-9' });
  assert.equal(r.results[0].legalName, 'Nokia Oyj');
  await assert.rejects(() => c.search({}), /Provide name/);
});

test('attribution present', () => {
  const a = gleifAttribution();
  assert.equal(a.licence.includes('CC0'), true);
  assert.match(a.attribution, /GLEIF/);
});
