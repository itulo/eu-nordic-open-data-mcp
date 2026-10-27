import { createEcbClient, convertInvoicesWithEcbRates } from '../src/lib/ecb.js';

const client = createEcbClient();
const fx = await client.fetchFxRates({ currencies: ['USD', 'GBP', 'SEK', 'NOK', 'CHF'], lastNObservations: 2 });
const policy = await client.fetchPolicyRates({ lastNObservations: 1 });
const hicp = await client.fetchHicpInflation({ areas: ['U2', 'FI'], lastNObservations: 1 });
const conv = convertInvoicesWithEcbRates([{ invoiceId: 'SMOKE-1', amount: 1000, fromCurrency: 'USD', toCurrency: 'EUR' }], fx);

if (!fx.length || !policy.length || !hicp.length) {
  console.error('Smoke failed: empty response from ECB SDMX API');
  process.exit(1);
}
for (const r of [...fx, ...policy, ...hicp, ...conv]) {
  if (!r.attribution || !r.attribution.includes('Source: ECB statistics')) {
    console.error('Missing mandatory ECB attribution:', r);
    process.exit(1);
  }
}
console.log(JSON.stringify({
  ok: true,
  fxCount: fx.length,
  policyCount: policy.length,
  hicpCount: hicp.length,
  sampleConversion: conv[0],
}));
