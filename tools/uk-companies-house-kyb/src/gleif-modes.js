// GLEIF LEI modes of the KYB actor (keyless, CC0). Company-level only: sole-proprietor LEIs are withheld.
// Events: lei-record ($ per LEI record) and ownership-chain ($ per entity with direct + ultimate parent resolved).
import { createGleifClient, gleifAttribution, normaliseLei } from './lib/gleif.js';
import { normaliseCompanyNumber } from './lib/ch.js';
// charge.js (apify SDK) is loaded lazily so offline tests run without the apify package.
const pushCharged = async (...a) => (await import('./lib/charge.js')).pushCharged(...a);

export const GLEIF_MODES = new Set(['gleif_lookup', 'gleif_search', 'gleif_ownership', 'gleif_by_company_number']);

export async function runGleif(mode, input, { fetchImpl, limiter, push = pushCharged } = {}) {
  const g = createGleifClient(limiter ? { fetchImpl, limiter } : { fetchImpl });
  const attr = gleifAttribution();
  const retrievedAt = new Date().toISOString();
  const maxResults = Math.min(Number(input.maxResults || 100), 5000);
  const summary = { mode, returned: 0, notFound: [], invalid: [], withheldSoleProprietors: 0, ...attr };
  const emit = async (rec, event) => {
    summary.returned++;
    const { stop } = await push({ recordType: event, ...rec, source: 'GLEIF LEI data (api.gleif.org)', retrievedAt, ...attr }, event);
    return stop;
  };
  const valid = (list) => {
    const out = [];
    for (const raw of (list || []).slice(0, 5000)) { try { out.push(normaliseLei(raw)); } catch { summary.invalid.push(raw); } }
    return [...new Set(out)];
  };
  if (mode === 'gleif_lookup') {
    const leis = valid(input.leis);
    if (!leis.length && !summary.invalid.length) throw new Error('mode=gleif_lookup needs leis (20-character LEI codes).');
    for (const r of await g.lookupMany(leis)) {
      if (!r.found) { summary.notFound.push(r.lei); continue; }
      if (r.withheld) { summary.withheldSoleProprietors++; continue; }
      if (await emit(r, 'lei-record')) { summary.stoppedAtChargeLimit = true; break; }
    }
  } else if (mode === 'gleif_ownership') {
    const leis = valid(input.leis);
    if (!leis.length && !summary.invalid.length) throw new Error('mode=gleif_ownership needs leis (20-character LEI codes).');
    for (const lei of leis) {
      const o = await g.ownership(lei, { includeChildrenCount: true });
      if (!o.found) { summary.notFound.push(lei); continue; }
      if (o.entity?.withheld) { summary.withheldSoleProprietors++; continue; }
      if (await emit(o, 'ownership-chain')) { summary.stoppedAtChargeLimit = true; break; }
    }
  } else if (mode === 'gleif_search') {
    if (!input.gleifName && !input.gleifRegisteredAs) throw new Error('mode=gleif_search needs gleifName or gleifRegisteredAs.');
    const r = await g.search({ name: input.gleifName, registeredAs: input.gleifRegisteredAs, country: input.gleifCountry, status: input.gleifStatus, limit: Math.min(maxResults, 50) });
    summary.upstreamTotal = r.total;
    for (const rec of r.results) {
      if (rec.withheld) { summary.withheldSoleProprietors++; continue; }
      if (await emit({ found: true, ...rec }, 'lei-record')) { summary.stoppedAtChargeLimit = true; break; }
    }
  } else if (mode === 'gleif_by_company_number') {
    summary.note = 'No Companies House API key was given, so the UK company numbers were looked up in GLEIF (registeredAs, country GB). Only companies that hold an LEI are returned. Add your free Companies House key for full profiles.';
    for (const raw of (input.companyNumbers || []).slice(0, 5000)) {
      let n;
      try { n = normaliseCompanyNumber(raw); } catch { summary.invalid.push(raw); continue; }
      const r = await g.search({ registeredAs: n, country: 'GB', limit: 5 });
      const hits = r.results.filter((x) => !x.withheld && String(x.registeredAs || '').toUpperCase().replace(/^0+/, '') === n.replace(/^0+/, ''));
      if (!hits.length) { summary.notFound.push(n); continue; }
      let stop = false;
      for (const h of hits) { if (await emit({ found: true, companyNumber: n, ...h }, 'lei-record')) { stop = true; break; } }
      if (stop) { summary.stoppedAtChargeLimit = true; break; }
    }
  }
  return summary;
}
