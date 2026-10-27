import { createEcbClient } from '../src/lib/ecb.js';

try {
  const client = createEcbClient();
  const fx = await client.fetchFxRates({ currencies: ['USD'], lastNObservations: 1 });
  if (!fx.length) throw new Error('Empty ECB USD FX response');
  console.log(JSON.stringify({ status: 'up', source: 'ecb', latestPeriod: fx[0].period, usdPerEur: fx[0].ratePerEur }));
} catch (err) {
  console.error(JSON.stringify({ status: 'down', source: 'ecb', error: String(err.message || err) }));
  process.exit(1);
}
