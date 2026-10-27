import { createEuvdClient } from '../src/lib/euvd.js';

const client = createEuvdClient();
const exploited = await client.fetchExploitedVulnerabilities();
const critical = await client.fetchCriticalVulnerabilities();
const searchRes = await client.searchVulnerabilities({ fromScore: 8, size: 5 });

if (!exploited.length || !critical.length) {
  console.error('Smoke failed: empty response from ENISA EUVD API');
  process.exit(1);
}
for (const r of [...exploited, ...critical, ...searchRes.items]) {
  if (!r.attribution || !r.attribution.includes('European Union Agency for Cybersecurity (ENISA)')) {
    console.error('Missing mandatory ENISA EUVD attribution:', r);
    process.exit(1);
  }
}
console.log(JSON.stringify({
  ok: true,
  exploitedCount: exploited.length,
  criticalCount: critical.length,
  searchItemsCount: searchRes.items.length,
  sampleExploited: {
    euvdId: exploited[0].euvdId,
    cveId: exploited[0].cveId,
    cvssBaseScore: exploited[0].cvssBaseScore,
    vendors: exploited[0].vendors,
  },
}));
