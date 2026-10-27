import { createDigitrafficClient } from '../src/lib/digitraffic.js';

const client = createDigitrafficClient();
const calls = await client.getPortCalls({ ports: ['FIHEL', 'FITKU', 'FIHKO', 'FIKTK'], maxResults: 15 });
const summary = await client.getPortCongestionSummary({ ports: ['FIHEL', 'FITKU', 'FIHKO', 'FIKTK'] });

if (!calls.length || !summary.length) {
  console.error('Smoke failed: empty port calls from Digitraffic API');
  process.exit(1);
}
for (const r of [...calls, ...summary]) {
  if (r.attribution !== 'Source: Fintraffic / digitraffic.fi, license CC 4.0 BY') {
    console.error('Missing or invalid Digitraffic attribution:', r);
    process.exit(1);
  }
}
console.log(JSON.stringify({
  ok: true,
  callsCount: calls.length,
  portsSummarized: summary.length,
  samplePortSummary: summary[0],
}));
