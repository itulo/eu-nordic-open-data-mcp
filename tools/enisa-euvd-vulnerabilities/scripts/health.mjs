import { createEuvdClient } from '../src/lib/euvd.js';

try {
  const client = createEuvdClient();
  const latest = await client.fetchLatestVulnerabilities();
  if (!latest.length) throw new Error('ENISA EUVD returned 0 latest vulnerabilities');
  console.log(JSON.stringify({ status: 'up', source: 'enisa_euvd', latestEuvdId: latest[0].euvdId, count: latest.length }));
} catch (err) {
  console.error(JSON.stringify({ status: 'down', source: 'enisa_euvd', error: String(err.message || err) }));
  process.exit(1);
}
