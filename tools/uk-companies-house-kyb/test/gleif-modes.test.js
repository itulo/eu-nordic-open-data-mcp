import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtureFetch } from '../src/lib/common.js';
import { runGleif } from '../src/gleif-modes.js';

const fx = (f) => path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'gleif', f);
const noLimit = (fn) => fn();
const NSN = '549300FI8QIVYMUMBB43';
const collect = () => { const items = []; const push = async (item, ev) => { items.push({ item, ev }); return { stop: false }; }; return { items, push }; };

test('gleif_ownership emits one ownership-chain record with parents and attribution', async () => {
  const f = fixtureFetch([
    { match: new RegExp(`/lei-records/${NSN}/direct-parent-relationship$`), file: fx('nsn_dp_rel.json') },
    { match: new RegExp(`/lei-records/${NSN}/ultimate-parent-relationship$`), file: fx('nsn_up_rel.json') },
    { match: new RegExp(`/lei-records/${NSN}/direct-children`), file: fx('nsn_children.json') },
    { match: /filter\[lei\]=549300A0JPRWG1KI7U06/, file: fx('nokia_batch.json') },
    { match: new RegExp(`/lei-records/${NSN}$`), file: fx('nsn.json') },
  ]);
  const { items, push } = collect();
  const s = await runGleif('gleif_ownership', { leis: [NSN, 'bad'] }, { fetchImpl: f, limiter: noLimit, push });
  assert.equal(items.length, 1);
  assert.equal(items[0].ev, 'ownership-chain');
  assert.equal(items[0].item.directParent.parentLei, '549300A0JPRWG1KI7U06');
  assert.match(items[0].item.attribution, /GLEIF/);
  assert.deepEqual(s.invalid, ['bad']);
});

test('gleif_lookup and keyless company-number fallback emit lei-record; sole proprietors withheld', async () => {
  const f = fixtureFetch([
    { match: /filter\[lei\]=/, file: fx('nokia_batch.json') },
    { match: /filter\[entity\.registeredAs\]=0112038-9/, file: fx('regas.json') },
  ]);
  const { items, push } = collect();
  await runGleif('gleif_lookup', { leis: ['549300A0JPRWG1KI7U06'] }, { fetchImpl: f, limiter: noLimit, push });
  assert.equal(items[0].ev, 'lei-record');
  assert.equal(items[0].item.lei, '549300A0JPRWG1KI7U06');
  const g = fixtureFetch([{ match: /filter\[entity\.registeredAs\]=/, json: { data: [], meta: { pagination: { total: 0 } } } }]);
  const c2 = collect();
  const s2 = await runGleif('gleif_by_company_number', { companyNumbers: ['445790'] }, { fetchImpl: g, limiter: noLimit, push: c2.push });
  assert.deepEqual(s2.notFound, ['00445790']);
  assert.match(s2.note, /No Companies House API key/);
  assert.ok(g.calls.every((c) => !/company-information/.test(c.url)));
});
