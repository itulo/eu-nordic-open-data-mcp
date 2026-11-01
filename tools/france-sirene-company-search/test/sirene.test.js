import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtureFetch } from '../src/lib/common.js';
import { createSireneClient, isValidSiren, frVatFromSiren, exclusionReason, mapCompany, buildSearchParams } from '../src/lib/sirene.js';

const fxp = (f) => path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', f);
const fx = (f) => JSON.parse(readFileSync(fxp(f), 'utf8'));
const noLimit = (fn) => fn();

test('SIREN validation and VAT computation', () => {
  assert.equal(isValidSiren('383474814'), true);
  assert.equal(isValidSiren('383474815'), false);
  assert.equal(isValidSiren('356000000'), true);
  assert.equal(frVatFromSiren('383474814'), 'FR89383474814');
});

test('exclusion rules', () => {
  assert.equal(exclusionReason({ nature_juridique: '1000' }), 'entrepreneur_individuel');
  assert.equal(exclusionReason({ nature_juridique: '5710', complements: { est_entrepreneur_individuel: true } }), 'entrepreneur_individuel');
  assert.equal(exclusionReason({ nature_juridique: '2110' }), 'grouping_without_legal_personality');
  assert.equal(exclusionReason({ nature_juridique: '5710', statut_diffusion: 'P' }), null);
  assert.equal(exclusionReason({ nature_juridique: '5710', statut_diffusion: 'N' }), 'non_diffusible');
  assert.equal(exclusionReason({ nature_juridique: '5710', statut_diffusion: 'O' }), null);
});

test('mapping keeps company-level fields only', () => {
  const r = mapCompany(fx('search_airbus.json').results[0]);
  assert.equal(r.siren, '383474814');
  assert.equal(r.name, 'AIRBUS');
  assert.equal(r.legalForm.code, '5710');
  assert.equal(r.headOffice.city, 'BLAGNAC');
  assert.equal(r.headOffice.postCode, '31700');
  assert.ok(r.sireneUpdatedAt);
  assert.match(r.attribution, /Licence Ouverte 2\.0/);
  const s = JSON.stringify(r);
  for (const k of ['dirigeants', 'adresse', 'latitude', 'longitude', 'libelle_voie', 'numero_voie', 'finances', 'nom', 'prenoms']) assert.ok(!s.includes(`"${k}"`), k);
  assert.ok(!/ROND-POINT/.test(s), 'no street address');
});

test('search params request minimal payload without directors', () => {
  const qs = buildSearchParams({ query: 'x', nafCodes: ['62.01Z', '62.02A'], status: 'active', ess: true }, 3);
  assert.equal(qs.get('minimal'), 'true');
  assert.equal(qs.get('include'), 'siege,complements');
  assert.equal(qs.get('activite_principale'), '62.01Z,62.02A');
  assert.equal(qs.get('etat_administratif'), 'A');
  assert.equal(qs.get('est_ess'), 'true');
  assert.equal(qs.get('est_entrepreneur_individuel'), 'false');
  assert.equal(qs.get('page'), '3');
});

test('search drops entrepreneurs individuels and paginates to maxResults', async () => {
  const page = fx('search_31700_6201.json');
  const f = fixtureFetch([{ match: /\/search\?/, json: () => page }]);
  const c = createSireneClient({ fetchImpl: f, limiter: noLimit });
  const stats = { pages: 0, seen: 0, excluded: {} };
  const out = [];
  for await (const r of c.search({ postCodes: ['31700'], nafCodes: ['62.01Z'], maxResults: 30, excludeMarketingOptOut: false }, stats)) out.push(r);
  assert.equal(out.length, 30);
  assert.equal(stats.pages, 2);
  assert.ok(stats.excluded.entrepreneur_individuel >= 1);
  assert.ok(out.every((r) => !r.legalForm.code.startsWith('1')));
});

test('partial diffusion: masked fields withheld, commune kept', () => {
  const base = fx('search_airbus.json').results[0];
  const r = mapCompany({ ...base, statut_diffusion: 'P', siege: { ...base.siege, statut_diffusion_etablissement: 'P', code_postal: '[ND]', adresse: '[ND]' } });
  assert.equal(r.diffusionStatus, 'P');
  assert.equal(r.headOffice.postCode, null);
  assert.equal(r.headOffice.city, 'BLAGNAC');
  assert.ok(!JSON.stringify(r).includes('[ND]'));
  assert.ok(r.partialDiffusionMasked.length > 0);
});

test('marketing opt-out excluded by default, kept and flagged when disabled', async () => {
  const page = fx('search_31700_6201.json');
  const mk = () => createSireneClient({ fetchImpl: fixtureFetch([{ match: /\/search\?/, json: () => ({ ...page, total_pages: 1 }) }]), limiter: noLimit });
  const s1 = { pages: 0, seen: 0, excluded: {} }; const a = [];
  for await (const r of mk().search({ postCodes: ['31700'], maxResults: 100 }, s1)) a.push(r);
  const s2 = { pages: 0, seen: 0, excluded: {} }; const b = [];
  for await (const r of mk().search({ postCodes: ['31700'], excludeMarketingOptOut: false, maxResults: 100 }, s2)) b.push(r);
  assert.ok(a.every((r) => r.marketingOptOut === false));
  assert.equal(b.length - a.length, s1.excluded.marketing_opt_out);
  assert.ok(b.some((r) => r.marketingOptOut === true));
});

test('lookup excludes opted-out companies by default', async () => {
  const f = () => fixtureFetch([{ match: /\/search\?/, file: fxp('lookup_383474814.json') }]);
  const s = { notFound: [], invalid: [], excluded: {} };
  assert.equal((await createSireneClient({ fetchImpl: f(), limiter: noLimit }).lookup(['383474814'], s)).length, 0);
  assert.equal(s.excluded.marketing_opt_out, 1);
  const kept = await createSireneClient({ fetchImpl: f(), limiter: noLimit }).lookup(['383474814'], undefined, { excludeMarketingOptOut: false });
  assert.equal(kept[0].marketingOptOut, true);
});

test('excludeProspectingOptOuts filter (legacy name ignored, default excludes)', async () => {
  const page = fx('search_31700_6201.json');
  const f = fixtureFetch([{ match: /\/search\?/, json: () => ({ ...page, total_pages: 1 }) }]);
  const c = createSireneClient({ fetchImpl: f, limiter: noLimit });
  const stats = { pages: 0, seen: 0, excluded: {} };
  const out = [];
  for await (const r of c.search({ postCodes: ['31700'], maxResults: 100 }, stats)) out.push(r);
  assert.ok(out.length > 0 && out.every((r) => r.marketingOptOut === false));
  assert.ok(stats.excluded.marketing_opt_out > 0);
});

test('search requires a query or filter', async () => {
  const c = createSireneClient({ fetchImpl: fixtureFetch([]), limiter: noLimit });
  await assert.rejects(async () => { for await (const _ of c.search({})) { /* noop */ } }, /Provide a query/);
});

test('lookup by SIREN / SIRET with invalid and not-found handling', async () => {
  const f = fixtureFetch([
    { match: /q=383474814/, file: fxp('lookup_383474814.json') },
    { match: /\/search\?/, json: { results: [], total_results: 0, total_pages: 0 } },
  ]);
  const c = createSireneClient({ fetchImpl: f, limiter: noLimit });
  const stats = { notFound: [], invalid: [], excluded: {} };
  const out = await c.lookup(['38347481400100', '123', '552100554'], stats, { excludeMarketingOptOut: false });
  assert.equal(out.length, 1);
  assert.equal(out[0].siren, '383474814');
  assert.deepEqual(stats.invalid, ['123']);
  assert.deepEqual(stats.notFound, ['552100554']);
});
