import { createViesClient } from '../src/lib/vies.js';

try {
  const client = createViesClient();
  const status = await client.checkMemberStatesStatus();
  if (!status.vowAvailable) throw new Error('VIES VOW gateway reported unavailable');
  console.log(JSON.stringify({ status: 'up', source: 'eu_vies', vowAvailable: status.vowAvailable, countriesCount: status.countries.length }));
} catch (err) {
  console.error(JSON.stringify({ status: 'down', source: 'eu_vies', error: String(err.message || err) }));
  process.exit(1);
}
