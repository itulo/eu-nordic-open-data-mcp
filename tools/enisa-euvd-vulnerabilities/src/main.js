// Apify actor entry point: EU ENISA European Vulnerability Database (EUVD) — Exploited KEV, Critical CVEs & EPSS/CVSS Search.
import { Actor, log } from 'apify';
import { createEuvdClient, euvdAttribution } from './lib/euvd.js';
import { chargeSafe } from './lib/charge.js';

await Actor.init();
try {
  await chargeSafe('actor-start');
  const input = (await Actor.getInput()) || {};
  const {
    modes = ['exploited', 'critical'],
    text = '',
    vendor = '',
    product = '',
    fromScore,
    toScore,
    fromEpss,
    toEpss,
    exploited,
    fromDate = '',
    toDate = '',
    assigner = '',
    ids = [],
    maxResults = 25,
  } = input;

  const client = createEuvdClient();
  const seenIds = new Set();
  const records = [];

  function pushUnique(list) {
    for (const r of list) {
      const k = r.euvdId || r.cveId || JSON.stringify(r);
      if (seenIds.has(k)) continue;
      seenIds.add(k);
      records.push(r);
      if (records.length >= maxResults) break;
    }
  }

  if (modes.includes('exploited') && records.length < maxResults) {
    const exp = await client.fetchExploitedVulnerabilities();
    pushUnique(exp);
  }

  if (modes.includes('critical') && records.length < maxResults) {
    const crit = await client.fetchCriticalVulnerabilities();
    pushUnique(crit);
  }

  if (modes.includes('latest') && records.length < maxResults) {
    const lat = await client.fetchLatestVulnerabilities();
    pushUnique(lat);
  }

  if (modes.includes('search') && records.length < maxResults) {
    const { items } = await client.searchVulnerabilities({
      text,
      vendor,
      product,
      fromScore,
      toScore,
      fromEpss,
      toEpss,
      exploited,
      fromDate,
      toDate,
      assigner,
      size: Math.min(100, maxResults),
    });
    pushUnique(items);
  }

  if (modes.includes('lookup_by_id') && Array.isArray(ids) && ids.length) {
    for (const id of ids) {
      if (records.length >= maxResults) break;
      const item = await client.lookupById(id);
      pushUnique([item]);
    }
  }

  for (const r of records) {
    await Actor.pushData(r);
    await chargeSafe('vulnerability-record', 1);
  }

  await Actor.setValue('OUTPUT_SUMMARY', {
    modes,
    recordsWritten: records.length,
    exploitedCount: records.filter((r) => r.isExploited).length,
    criticalCount: records.filter((r) => r.severityLabel === 'CRITICAL').length,
    ...euvdAttribution(),
  });
  log.info(`enisa-euvd-vulnerabilities completed: modes=${modes.join(',')}, records=${records.length}`);
} catch (err) {
  log.exception(err, 'Run failed');
  await Actor.fail(String(err.message || err));
}
await Actor.exit();
