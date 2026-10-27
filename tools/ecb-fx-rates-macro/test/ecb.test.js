import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSdmxJson, convertInvoicesWithEcbRates, createEcbClient, ecbAttribution } from '../src/lib/ecb.js';

const SAMPLE_SDMX = {
  dataSets: [
    {
      series: {
        '0:0:0:0:0': {
          observations: {
            '0': [1.08, 0],
            '1': [1.10, 0],
          },
        },
        '0:1:0:0:0': {
          observations: {
            '0': [11.40, 0],
            '1': [11.50, 0],
          },
        },
      },
    },
  ],
  structure: {
    dimensions: {
      series: [
        { id: 'FREQ', values: [{ id: 'D', name: 'Daily' }] },
        { id: 'CURRENCY', values: [{ id: 'USD', name: 'US dollar' }, { id: 'SEK', name: 'Swedish krona' }] },
        { id: 'CURRENCY_DENOM', values: [{ id: 'EUR', name: 'Euro' }] },
        { id: 'EXR_TYPE', values: [{ id: 'SP00', name: 'Spot' }] },
        { id: 'EXR_SUFFIX', values: [{ id: 'A', name: 'Average' }] },
      ],
      observation: [
        {
          id: 'TIME_PERIOD',
          values: [
            { id: '2026-10-23', name: '2026-10-23' },
            { id: '2026-10-26', name: '2026-10-26' },
          ],
        },
      ],
    },
  },
};

test('1. parseSdmxJson extracts dimensions, time periods, and numeric observations', () => {
  const rows = parseSdmxJson(SAMPLE_SDMX);
  assert.equal(rows.length, 4);
  const usdLatest = rows.find((r) => r.dimensions.CURRENCY.id === 'USD' && r.period === '2026-10-26');
  assert.equal(usdLatest.value, 1.10);
});

test('2. createEcbClient.fetchFxRates returns sorted FX records with inverse rate and attribution', async () => {
  const client = createEcbClient({
    minIntervalMs: 1,
    fetchImpl: async () => new Response(JSON.stringify(SAMPLE_SDMX), { status: 200 }),
  });
  const fx = await client.fetchFxRates({ currencies: ['USD', 'SEK'], lastNObservations: 2 });
  assert.equal(fx.length, 4);
  assert.equal(fx[0].period, '2026-10-26');
  assert.ok(fx[0].inverseEurPerUnit > 0);
  assert.ok(fx[0].attribution.includes('Source: ECB statistics'));
});

test('3. convertInvoicesWithEcbRates converts USD->EUR and cross-rate USD->SEK with weekend fallback', async () => {
  const client = createEcbClient({
    minIntervalMs: 1,
    fetchImpl: async () => new Response(JSON.stringify(SAMPLE_SDMX), { status: 200 }),
  });
  const fx = await client.fetchFxRates({ currencies: ['USD', 'SEK'], lastNObservations: 2 });
  // Request date 2026-10-25 (Sunday) should fall back to 2026-10-23 (Friday, USD=1.08)
  const converted = convertInvoicesWithEcbRates([
    { invoiceId: 'INV-SUN', amount: 1080, fromCurrency: 'USD', toCurrency: 'EUR', date: '2026-10-25' },
    { invoiceId: 'INV-CROSS', amount: 110, fromCurrency: 'USD', toCurrency: 'SEK', date: '2026-10-26' },
  ], fx);

  assert.equal(converted.length, 2);
  assert.equal(converted[0].ecbRateDateUsed, '2026-10-23');
  assert.equal(converted[0].convertedAmount, 1000);
  assert.equal(converted[0].modified, true);

  assert.equal(converted[1].ecbRateDateUsed, '2026-10-26');
  assert.equal(converted[1].convertedAmount, 1150);
});

test('4. convertInvoicesWithEcbRates throws clear error for unknown currency', () => {
  assert.throws(() => convertInvoicesWithEcbRates([{ amount: 100, fromCurrency: 'XYZ', toCurrency: 'EUR' }], []), /No ECB reference rate/);
});

test('5. ecbAttribution includes official ESCB reuse policy string', () => {
  const attr = ecbAttribution();
  assert.ok(attr.attribution.includes('Source: ECB statistics'));
  assert.ok(attr.licenceUrl.includes('ecb.europa.eu'));
});
