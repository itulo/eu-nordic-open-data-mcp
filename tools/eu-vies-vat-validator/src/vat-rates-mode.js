// vat_rates mode: EU VAT rates per Member State from the European Commission Taxes in Europe Database (TEDB), CC BY 4.0.
import { createTedbClient, tedbAttribution, MEMBER_STATES, normaliseCountry } from './lib/tedb.js';

export async function vatRateRecords(input = {}, { fetchImpl, limiter } = {}) {
  const client = createTedbClient({ ...(fetchImpl ? { fetchImpl } : {}), ...(limiter ? { limiter } : {}) });
  const countries = (input.vatRateCountries?.length ? input.vatRateCountries : MEMBER_STATES).map(normaliseCountry);
  const date = input.vatRateDate || undefined;
  const cnCodes = input.cnCodes || []; const cpaCodes = input.cpaCodes || []; const categories = input.vatRateCategories || [];
  const attr = tedbAttribution();
  const retrievedAt = new Date().toISOString();
  const base = { source: 'European Commission TEDB (ec.europa.eu/taxation_customs/tedb)', retrievedAt, ...attr };
  if (!cnCodes.length && !cpaCodes.length && !categories.length) {
    const r = await client.standardRates({ countries, date });
    return r.countries.map((c) => ({ recordType: 'eu_vat_rates', situationOn: r.situationOn, countryCode: c.country, ...c, ...base }));
  }
  const r = await client.lookup({ countries, date, cnCodes, cpaCodes, categories, limit: 1000 });
  const std = await client.standardRates({ countries, date });
  return std.countries.map((s) => {
    const rows = r.rows.filter((x) => x.country === s.country);
    return {
      recordType: 'eu_vat_rate_lookup', situationOn: r.situationOn, countryCode: s.country, country: s.country, query: r.query,
      standardRate: s.standardRate, matchedRates: rows,
      appliesStandardRate: rows.length === 0,
      note: rows.length ? null : 'No specific reduced/exempt entry found in TEDB for this query: the standard rate presumably applies (verify with the national tax authority).',
      ...base,
    };
  });
}
