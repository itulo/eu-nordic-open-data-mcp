// Apify actor: UK Companies House KYB lookup / search (company-level only, user's own API key)
// plus GLEIF LEI modes (keyless): gleif_lookup, gleif_search, gleif_ownership.
import { Actor, log } from 'apify';
import { createChClient, normaliseCompanyNumber } from './lib/ch.js';
import { chargeSafe, pushCharged } from './lib/charge.js';
import { runGleif, GLEIF_MODES } from './gleif-modes.js';

await Actor.init();
try {
  const input = (await Actor.getInput()) || {};
  const apiKey = input.apiKey || process.env.COMPANIES_HOUSE_API_KEY;
  let mode = input.mode || (input.companyNumbers?.length ? 'lookup' : input.query ? 'search' : input.leis?.length ? 'gleif_lookup' : 'advanced_search');
  if (!apiKey && mode === 'lookup' && input.companyNumbers?.length) {
    // Keyless fallback: no Companies House key -> look the UK company numbers up in GLEIF (CC0) instead.
    log.warning('No Companies House API key given: returning GLEIF LEI records for these UK company numbers instead (add your free key for full Companies House profiles).');
    await Actor.setStatusMessage('No Companies House API key: returned GLEIF LEI data for the company numbers instead. Add your free key for full profiles.');
    mode = 'gleif_by_company_number';
  }
  if (GLEIF_MODES.has(mode)) {
    const summary = await runGleif(mode, input);
    await Actor.setValue('OUTPUT_SUMMARY', summary);
    log.info(`GLEIF ${mode}: ${summary.returned} records`);
    await Actor.exit();
  }
  const client = createChClient({ apiKey }); // throws a clear message if no key (before any charge)
  const enrichOpts = { filingHistory: Number(input.filingHistoryItems || 0), charges: !!input.includeCharges, insolvency: !!input.includeInsolvency };
  const maxResults = Math.min(Number(input.maxResults || 100), 5000);
  const summary = { mode, notFound: [], invalid: [], returned: 0, enrichmentItems: 0 };

  async function emit(rec) {
    if (enrichOpts.filingHistory || enrichOpts.charges || enrichOpts.insolvency) await client.enrich(rec, enrichOpts);
    const extra = (rec.filingHistory?.length || 0) + (rec.charges?.items?.length || 0) + (rec.insolvency?.cases?.length || 0);
    const { stop } = await pushCharged(rec, 'company-profile');
    if (extra) await chargeSafe('company-event', extra);
    summary.returned++;
    summary.enrichmentItems += extra;
    return stop;
  }

  if (mode === 'lookup') {
    for (const raw of (input.companyNumbers || []).slice(0, 5000)) {
      let n;
      try { n = normaliseCompanyNumber(raw); } catch { summary.invalid.push(raw); continue; }
      const rec = await client.profile(n);
      if (!rec) { summary.notFound.push(n); continue; }
      if (await emit(rec)) { summary.stoppedAtChargeLimit = true; break; }
    }
  } else if (mode === 'search') {
    if (!input.query) throw new Error('mode=search needs a query (company name or number).');
    for await (const rec of client.search(input.query, { maxResults, fetchProfiles: input.fetchFullProfiles !== false })) {
      if (await emit(rec)) { summary.stoppedAtChargeLimit = true; break; }
    }
  } else {
    for await (const rec of client.advancedSearch(input, { maxResults, fetchProfiles: !!input.fetchFullProfiles })) {
      if (await emit(rec)) { summary.stoppedAtChargeLimit = true; break; }
    }
  }
  summary.personalDataPolicy = 'Company-level only: officers, PSCs and other person registers are never queried; filing descriptions whitelisted; charge holders counted, not named; insolvency practitioners and care-of names dropped.';
  log.info(`Companies House ${mode}: ${summary.returned} companies`);
  await Actor.setValue('OUTPUT_SUMMARY', summary);
} catch (err) {
  log.error(String(err.message || err)); // never includes the API key
  await Actor.fail(String(err.message || err));
}
await Actor.exit();
