import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseSanctionsCsv,
  screenOne,
  screenBatch,
  lookupEntities,
  NOT_LEGAL_ADVICE_DISCLAIMER,
  POSSIBLE_MATCH_LABEL,
} from '../src/lib/sanctions.js';
import { sanctionsJsonResult, sanctionsErrorResult } from '../src/mcp-server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureCsv = fs.readFileSync(path.join(__dirname, 'fixtures', 'sanctions_sample.csv'), 'utf8');

test('parseSanctionsCsv collapses multi-row entities and extracts fileGenerationDate + listPublicationDate', () => {
  const index = parseSanctionsCsv(fixtureCsv);
  assert.equal(index.fileGenerationDate, '23/10/2026');
  assert.equal(index.listPublicationDate, '2026-10-23');
  assert.equal(index.totalEntities, 2);
  assert.deepEqual(index.programmes, ['IRQ', 'RUS']);
  assert.ok(index.attribution.includes('23/10/2026'));
  assert.ok(index.attribution.includes('Decision 2011/833/EU'));
  assert.equal(index.disclaimer, NOT_LEGAL_ADVICE_DISCLAIMER);

  const p = index.entities.find((e) => e.logicalId === '13');
  assert.equal(p.subjectType, 'person');
  assert.equal(p.euReferenceNumber, 'EU.27.28');
  assert.equal(p.names.length, 2);
  assert.equal(p.birthDates[0].year, '1937');
  assert.deepEqual(p.citizenships, ['IQ']);
  assert.equal(p.identifications[0].number, 'P-998877');
});

test('screenOne identifies exact name match as exact match with score 1.0', () => {
  const index = parseSanctionsCsv(fixtureCsv);
  const res = screenOne(index, 'Saddam Hussein Al-Tikriti');
  assert.equal(res.status, 'exact_match');
  assert.equal(res.matches.length, 1);
  assert.equal(res.matches[0].matchType, 'exact match');
  assert.equal(res.matches[0].matchLabel, 'exact match');
  assert.equal(res.matches[0].isExactMatch, true);
  assert.equal(res.matches[0].score, 1.0);
  assert.equal(res.matches[0].listPublicationDate, '2026-10-23');
  assert.equal(res.matches[0].disclaimer, NOT_LEGAL_ADVICE_DISCLAIMER);
  assert.ok(res.matches[0].attribution.includes('Decision 2011/833/EU'));
});

test('screenOne labels non-exact fuzzy matches strictly as "possible match" (Decision 2011/833/EU non-distortion)', () => {
  const index = parseSanctionsCsv(fixtureCsv);
  // Slight typo in name: "Sadam Husein Al Tikriti"
  const res = screenOne(index, 'Sadam Husein Al Tikriti', { fuzzyThreshold: 0.75 });
  assert.equal(res.status, 'possible_match');
  assert.equal(res.matches.length, 1);
  const m = res.matches[0];
  assert.equal(m.isExactMatch, false);
  assert.equal(m.matchType, 'possible match');
  assert.equal(m.matchLabel, POSSIBLE_MATCH_LABEL);
  assert.ok(m.possibleMatchWarning.includes('Possible match only'));
  assert.ok(m.score >= 0.75 && m.score < 1.0);
  assert.equal(m.listPublicationDate, '2026-10-23');
  assert.equal(m.disclaimer, NOT_LEGAL_ADVICE_DISCLAIMER);
  assert.ok(m.attribution.includes('23/10/2026'));
});

test('screenOne supports exact matching by EU reference number and identification/registration number', () => {
  const index = parseSanctionsCsv(fixtureCsv);
  const byRef = screenOne(index, 'EU.9001.55');
  assert.equal(byRef.status, 'exact_match');
  assert.equal(byRef.matches[0].matchedOn, 'euReferenceNumber');
  assert.equal(byRef.matches[0].primaryName, 'Oboronprom Sever JSC');

  const byId = screenOne(index, '7701234567');
  assert.equal(byId.status, 'exact_match');
  assert.equal(byId.matches[0].matchedOn, 'identificationNumber');
  assert.equal(byId.matches[0].euReferenceNumber, 'EU.9001.55');
});

test('screenBatch filters by subjectType, programme, and country and returns clear rows with full compliance fields', () => {
  const index = parseSanctionsCsv(fixtureCsv);
  const batch = screenBatch(index, ['Oboronprom Sever JSC', 'Clean Finnish Company Oy'], {
    subjectType: 'enterprise',
    programmes: ['RUS'],
    country: 'RU',
  });
  assert.equal(batch.totalScreened, 2);
  assert.equal(batch.queriesWithExactMatch, 1);
  assert.equal(batch.queriesClear, 1);
  assert.equal(batch.datasetRows.length, 2);
  for (const row of batch.datasetRows) {
    assert.equal(row.listPublicationDate, '2026-10-23');
    assert.equal(row.fileGenerationDate, '23/10/2026');
    assert.equal(row.disclaimer, NOT_LEGAL_ADVICE_DISCLAIMER);
    assert.ok(row.attribution.includes('Decision 2011/833/EU'));
  }
});

test('lookupEntities and MCP result helpers always attach attribution, listPublicationDate, and disclaimer (including errors)', () => {
  const index = parseSanctionsCsv(fixtureCsv);
  const looked = lookupEntities(index, { programme: 'RUS' });
  assert.equal(looked.count, 1);
  assert.equal(looked.entities[0].euReferenceNumber, 'EU.9001.55');

  const okMsg = JSON.parse(sanctionsJsonResult('23/10/2026', { hello: 'world' }).content[0].text);
  assert.equal(okMsg.listPublicationDate, '2026-10-23');
  assert.equal(okMsg.disclaimer, NOT_LEGAL_ADVICE_DISCLAIMER);
  assert.ok(okMsg.attribution.includes('23/10/2026'));

  const errRes = sanctionsErrorResult('23/10/2026', new Error('upstream timeout'));
  assert.equal(errRes.isError, true);
  const errMsg = JSON.parse(errRes.content[0].text);
  assert.equal(errMsg.error, 'upstream timeout');
  assert.equal(errMsg.listPublicationDate, '2026-10-23');
  assert.equal(errMsg.disclaimer, NOT_LEGAL_ADVICE_DISCLAIMER);
  assert.ok(errMsg.attribution.includes('Decision 2011/833/EU'));
});
