// Apify actor entry point: ECB Official EUR Reference FX Rates, Policy Interest Rates, HICP Inflation & B2B Invoice Converter.
import { Actor, log } from 'apify';
import {
  createEcbClient,
  convertInvoicesWithEcbRates,
  ecbAttribution,
  DEFAULT_CURRENCIES,
  DEFAULT_INFLATION_AREAS,
} from './lib/ecb.js';
import { chargeSafe } from './lib/charge.js';

await Actor.init();
try {
  await chargeSafe('actor-start');
  const input = (await Actor.getInput()) || {};
  const {
    modes = ['fx_rates', 'policy_rates', 'hicp_inflation', 'invoice_converter'],
    currencies = DEFAULT_CURRENCIES,
    lastNObservations = 5,
    startPeriod = '',
    endPeriod = '',
    inflationAreas = DEFAULT_INFLATION_AREAS,
    invoices = [
      { invoiceId: 'INV-001', amount: 1500, fromCurrency: 'USD', toCurrency: 'EUR' },
      { invoiceId: 'INV-002', amount: 25000, fromCurrency: 'SEK', toCurrency: 'EUR' },
    ],
  } = input;

  const client = createEcbClient();
  const records = [];
  let cachedFx = null;

  if (modes.includes('fx_rates') || modes.includes('invoice_converter')) {
    const neededCurrencies = new Set(currencies.map((c) => String(c).toUpperCase()));
    if (modes.includes('invoice_converter')) {
      for (const inv of invoices) {
        if (inv.fromCurrency) neededCurrencies.add(String(inv.fromCurrency).toUpperCase());
        if (inv.toCurrency) neededCurrencies.add(String(inv.toCurrency).toUpperCase());
      }
    }
    cachedFx = await client.fetchFxRates({
      currencies: [...neededCurrencies],
      lastNObservations: Math.max(lastNObservations, 10),
      startPeriod: startPeriod || undefined,
      endPeriod: endPeriod || undefined,
    });
    if (modes.includes('fx_rates')) {
      records.push(...cachedFx);
    }
  }

  if (modes.includes('policy_rates')) {
    const policy = await client.fetchPolicyRates({ lastNObservations });
    records.push(...policy);
  }

  if (modes.includes('hicp_inflation')) {
    const hicp = await client.fetchHicpInflation({ areas: inflationAreas, lastNObservations });
    records.push(...hicp);
  }

  if (modes.includes('invoice_converter') && invoices.length && cachedFx) {
    const converted = convertInvoicesWithEcbRates(invoices, cachedFx);
    records.push(...converted);
  }

  for (const r of records) {
    await Actor.pushData(r);
    await chargeSafe('macro-or-fx-record', 1);
  }

  await Actor.setValue('OUTPUT_SUMMARY', {
    modes,
    currencies,
    inflationAreas,
    recordsWritten: records.length,
    ...ecbAttribution(),
  });
  log.info(`ecb-fx-rates-macro completed: modes=${modes.join(',')}, records=${records.length}`);
} catch (err) {
  log.exception(err, 'Run failed');
  await Actor.fail(String(err.message || err));
}
await Actor.exit();
