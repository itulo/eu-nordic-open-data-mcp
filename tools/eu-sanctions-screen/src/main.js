// Apify actor entry point: EU Consolidated Financial Sanctions List (DG FISMA / FSF) screening.
import { Actor, log } from 'apify';
import { loadSanctionsList, screenBatch, lookupEntities, complianceEnvelope } from './lib/sanctions.js';
import { chargeSafe } from './lib/charge.js';

await Actor.init();
try {
  await chargeSafe('actor-start');
  const input = (await Actor.getInput()) || {};
  const {
    queries = [],
    subjectType = 'all',
    programmes = [],
    country = '',
    fuzzyThreshold = 0.78,
    maxMatchesPerQuery = 5,
    includeClearQueries = true,
  } = input;

  const index = await loadSanctionsList();
  log.info(
    `Loaded EU Consolidated Financial Sanctions List (generated ${index.fileGenerationDate} / ${index.listPublicationDate}): ${index.totalEntities} entities across ${index.programmes.length} programmes`
  );

  if (queries.length > 0) {
    const batch = screenBatch(index, queries, {
      subjectType,
      programmes,
      country,
      fuzzyThreshold,
      maxMatches: maxMatchesPerQuery,
      includeClearQueries,
    });

    for (const row of batch.datasetRows) {
      const c = await chargeSafe('screened-query');
      if (c?.eventChargeLimitReached && c?.chargedCount === 0) break;
      await Actor.pushData(row);
      if (c?.eventChargeLimitReached) break;
    }

    const summary = {
      mode: 'screen',
      totalScreened: batch.totalScreened,
      queriesWithExactMatch: batch.queriesWithExactMatch,
      queriesWithPossibleMatch: batch.queriesWithPossibleMatch,
      queriesClear: batch.queriesClear,
      datasetRowsWritten: batch.datasetRows.length,
      ...complianceEnvelope(index.fileGenerationDate),
    };
    log.info(
      `Screened ${batch.totalScreened} queries: ${batch.queriesWithExactMatch} exact, ${batch.queriesWithPossibleMatch} possible match, ${batch.queriesClear} clear`
    );
    await Actor.setValue('OUTPUT_SUMMARY', summary);
  } else {
    // Browse / lookup mode when no queries are supplied
    const looked = lookupEntities(index, {
      programme: programmes[0],
      subjectType,
      country,
      limit: maxMatchesPerQuery || 25,
    });
    for (const ent of looked.entities) {
      const c = await chargeSafe('screened-query');
      if (c?.eventChargeLimitReached && c?.chargedCount === 0) break;
      await Actor.pushData({
        query: '*',
        status: 'listed_entity',
        matchType: 'listed entity',
        matchLabel: 'listed entity (browse mode)',
        score: 1.0,
        ...ent,
      });
      if (c?.eventChargeLimitReached) break;
    }
    const summary = {
      mode: 'browse',
      returned: looked.count,
      totalEntitiesInList: index.totalEntities,
      ...complianceEnvelope(index.fileGenerationDate),
    };
    await Actor.setValue('OUTPUT_SUMMARY', summary);
  }
} catch (err) {
  log.exception(err, 'Run failed');
  await Actor.fail(String(err.message || err));
}
await Actor.exit();
