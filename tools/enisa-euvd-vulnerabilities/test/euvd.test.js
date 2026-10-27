import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEuvdRecord, createEuvdClient, euvdAttribution } from '../src/lib/euvd.js';

const SAMPLE_EUVD = {
  id: 'EUVD-2026-107265',
  enisaUuid: '8c112d87-d5c7-3473-982c-a1caf22fab02',
  description: 'Remote code execution in PHP request memory handling.',
  datePublished: 'Oct 21, 2026, 1:54:43 PM',
  dateUpdated: 'Oct 27, 2026, 12:18:08 PM',
  baseScore: 9.2,
  baseScoreVersion: '4.0',
  baseScoreVector: 'CVSS:4.0/AV:N/AC:H/AT:P/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N',
  references: 'https://github.com/php/php-src/security/advisories/GHSA-6wmf-4rv5-p3rp\n',
  aliases: 'CVE-2026-109619\nGHSA-6wmf-4rv5-p3rp\n',
  assigner: 'php',
  epss: 100,
  exploitedSince: 'Oct 26, 2026, 12:00:00 AM',
  enisaIdVendor: [{ vendor: { name: 'PHP Group' } }],
  enisaIdProduct: [{ product: { name: 'PHP' }, product_version: '8.3.x' }],
};

test('1. normalizeEuvdRecord extracts CVE ID, severityLabel, vendors, products, and attribution', () => {
  const rec = normalizeEuvdRecord(SAMPLE_EUVD);
  assert.equal(rec.euvdId, 'EUVD-2026-107265');
  assert.equal(rec.cveId, 'CVE-2026-109619');
  assert.equal(rec.severityLabel, 'CRITICAL');
  assert.equal(rec.cvssBaseScore, 9.2);
  assert.equal(rec.epssScorePct, 100);
  assert.equal(rec.isExploited, true);
  assert.deepEqual(rec.vendors, ['PHP Group']);
  assert.deepEqual(rec.products, ['PHP (8.3.x)']);
  assert.ok(rec.attribution.includes('European Union Agency for Cybersecurity (ENISA)'));
});

test('2. normalizeEuvdRecord assigns HIGH, MEDIUM, LOW severity labels accurately', () => {
  assert.equal(normalizeEuvdRecord({ ...SAMPLE_EUVD, baseScore: 7.5, exploitedSince: null }).severityLabel, 'HIGH');
  assert.equal(normalizeEuvdRecord({ ...SAMPLE_EUVD, baseScore: 5.0, exploitedSince: null }).severityLabel, 'MEDIUM');
  assert.equal(normalizeEuvdRecord({ ...SAMPLE_EUVD, baseScore: 2.1, exploitedSince: null }).severityLabel, 'LOW');
});

test('3. createEuvdClient fetches exploited and searched vulnerabilities with injected fetchImpl', async () => {
  const client = createEuvdClient({
    minIntervalMs: 1,
    fetchImpl: async (url) => {
      if (String(url).includes('/search')) {
        return new Response(JSON.stringify({ total: 1, items: [SAMPLE_EUVD] }), { status: 200 });
      }
      return new Response(JSON.stringify([SAMPLE_EUVD]), { status: 200 });
    },
  });

  const exp = await client.fetchExploitedVulnerabilities();
  assert.equal(exp.length, 1);
  assert.equal(exp[0].cveId, 'CVE-2026-109619');

  const searchRes = await client.searchVulnerabilities({ vendor: 'PHP', fromScore: 8 });
  assert.equal(searchRes.total, 1);
  assert.equal(searchRes.items.length, 1);
});

test('4. createEuvdClient.lookupById normalizes single vulnerability lookup', async () => {
  const client = createEuvdClient({
    minIntervalMs: 1,
    fetchImpl: async () => new Response(JSON.stringify(SAMPLE_EUVD), { status: 200 }),
  });
  const rec = await client.lookupById('CVE-2026-109619');
  assert.equal(rec.euvdId, 'EUVD-2026-107265');
});

test('5. euvdAttribution includes ENISA Legal Notice and NIS2 disclaimer', () => {
  const attr = euvdAttribution();
  assert.ok(attr.attribution.includes('euvd.enisa.europa.eu'));
  assert.ok(attr.legalDisclaimer.includes('NIS2'));
});
