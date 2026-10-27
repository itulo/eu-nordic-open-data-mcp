// Live smoke test against the official EU Consolidated Financial Sanctions List (DG FISMA / FSF) CSV 1.1.
import assert from 'node:assert/strict';
import { loadSanctionsList, screenBatch } from '../src/lib/sanctions.js';

const index = await loadSanctionsList();
assert.ok(index.totalEntities > 1000, `Expected >1000 sanctioned entities, got ${index.totalEntities}`);
assert.ok(index.fileGenerationDate && index.fileGenerationDate !== 'unknown', 'Expected fileGenerationDate');
assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(index.listPublicationDate), `Expected ISO listPublicationDate, got ${index.listPublicationDate}`);

const sampleEntity = index.entities[0];
const fuzzyQuery = sampleEntity.primaryName.slice(0, Math.max(5, sampleEntity.primaryName.length - 1));
const batch = screenBatch(index, [sampleEntity.primaryName, fuzzyQuery, 'NonExistentCleanEntityOyj999999'], {
  fuzzyThreshold: 0.75,
  maxMatches: 3,
});

assert.equal(batch.totalScreened, 3);
assert.ok(batch.queriesWithExactMatch >= 1);
assert.ok(batch.queriesClear >= 1);
for (const row of batch.datasetRows) {
  assert.ok(row.attribution && row.attribution.includes('Decision 2011/833/EU'), 'Missing attribution');
  assert.ok(row.disclaimer && row.disclaimer.includes('Not legal advice'), 'Missing disclaimer');
  assert.equal(row.listPublicationDate, index.listPublicationDate);
  if (row.status === 'possible_match') {
    assert.equal(row.matchType, 'possible match');
    assert.ok(row.matchLabel.startsWith('possible match'));
  }
}

console.log(
  JSON.stringify({
    ok: true,
    fileGenerationDate: index.fileGenerationDate,
    listPublicationDate: index.listPublicationDate,
    totalEntities: index.totalEntities,
    programmesCount: index.programmes.length,
    sampleExactQuery: sampleEntity.primaryName,
    queriesWithExactMatch: batch.queriesWithExactMatch,
    queriesWithPossibleMatch: batch.queriesWithPossibleMatch,
    queriesClear: batch.queriesClear,
  })
);
