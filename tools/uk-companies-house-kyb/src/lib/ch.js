// UK Companies House public data API (api.company-information.service.gov.uk), company-level only.
// The user supplies their OWN free API key (HTTP Basic, key as username). The key is never logged.
// Personal-data rules: officers / PSC / disqualified-officer / LLP-member endpoints are NEVER called;
// filing-history description_values are whitelisted (no officer names); charge persons_entitled are
// reduced to a count; insolvency practitioners are dropped; registered-office "care_of" is dropped.
import { attributionFor, createLimiter, fetchJson, HttpError } from './common.js';

export const CH_BASE = 'https://api.company-information.service.gov.uk';
// Companies House: 600 requests per 5 minutes per key -> >= 550 ms between requests.
const defaultLimiter = createLimiter(550);
const UA = 'uk-companies-house-kyb/0.1 (Apify actor by itulo; +https://github.com/itulo/eu-nordic-open-data-mcp)';

export function normaliseCompanyNumber(n) {
  let v = String(n || '').trim().toUpperCase().replace(/\s+/g, '');
  if (/^\d{1,8}$/.test(v)) v = v.padStart(8, '0');
  if (/^[A-Z]{2}\d{1,6}$/.test(v)) v = v.slice(0, 2) + v.slice(2).padStart(6, '0');
  if (!/^[A-Z0-9]{8}$/.test(v)) throw new Error(`Invalid company number "${n}" (8 characters, e.g. 00000006, SC123456, OC301540)`);
  return v;
}

function address(a) {
  if (!a) return null;
  // care_of can name a natural person -> dropped. PO box kept (not personal).
  return {
    premises: a.premises || null,
    addressLine1: a.address_line_1 || null,
    addressLine2: a.address_line_2 || null,
    locality: a.locality || null,
    region: a.region || null,
    postalCode: a.postal_code || null,
    country: a.country || null,
    poBox: a.po_box || null,
  };
}

export function mapProfile(p, { retrievedAt = new Date().toISOString() } = {}) {
  return {
    companyNumber: p.company_number,
    companyName: p.company_name || null,
    status: p.company_status || null,
    statusDetail: p.company_status_detail || null,
    type: p.type || null,
    subtype: p.subtype || null,
    jurisdiction: p.jurisdiction || null,
    incorporatedOn: p.date_of_creation || null,
    dissolvedOn: p.date_of_cessation || null,
    sicCodes: p.sic_codes || [],
    registeredOfficeAddress: address(p.registered_office_address),
    registeredOfficeUndeliverable: p.undeliverable_registered_office_address ?? null,
    registeredOfficeInDispute: p.registered_office_is_in_dispute ?? null,
    previousNames: (p.previous_company_names || []).map((x) => ({ name: x.name, from: x.effective_from || null, to: x.ceased_on || null })),
    accounts: p.accounts ? {
      nextDue: p.accounts.next_due || p.accounts.next_accounts?.due_on || null,
      nextMadeUpTo: p.accounts.next_made_up_to || p.accounts.next_accounts?.period_end_on || null,
      overdue: p.accounts.overdue ?? p.accounts.next_accounts?.overdue ?? null,
      lastMadeUpTo: p.accounts.last_accounts?.made_up_to || null,
      lastType: p.accounts.last_accounts?.type || null,
      accountingReferenceDate: p.accounts.accounting_reference_date ? `${p.accounts.accounting_reference_date.day}/${p.accounts.accounting_reference_date.month}` : null,
    } : null,
    confirmationStatement: p.confirmation_statement ? {
      nextDue: p.confirmation_statement.next_due || null,
      nextMadeUpTo: p.confirmation_statement.next_made_up_to || null,
      lastMadeUpTo: p.confirmation_statement.last_made_up_to || null,
      overdue: p.confirmation_statement.overdue ?? null,
    } : null,
    hasCharges: p.has_charges ?? null,
    hasInsolvencyHistory: p.has_insolvency_history ?? null,
    hasBeenLiquidated: p.has_been_liquidated ?? null,
    foreignCompany: p.foreign_company_details ? {
      originatingRegistry: p.foreign_company_details.originating_registry?.name || null,
      country: p.foreign_company_details.originating_registry?.country || null,
      registrationNumber: p.foreign_company_details.registration_number || null,
      legalForm: p.foreign_company_details.legal_form || null,
    } : null,
    registerUrl: `https://find-and-update.company-information.service.gov.uk/company/${p.company_number}`,
    source: 'companies_house',
    retrievedAt,
    ...attributionFor('companies_house'),
  };
}

const SAFE_DESC_KEYS = new Set(['made_up_date', 'date', 'new_date', 'change_date', 'charge_number', 'charge_creation_date', 'form_attached', 'original_description', 'resolution_date', 'case_start_date', 'case_end_date', 'branch_number', 'old_address', 'new_address', 'notification_date', 'cessation_date', 'brought_down_date', 'capital']);
// old_address/new_address are registered-office change descriptions (company-level); officer-related keys
// (officer_name, appointment_date with names, psc_name, person_name...) are dropped by the whitelist.
export function mapFiling(f) {
  const dv = {};
  for (const [k, v] of Object.entries(f.description_values || {})) if (SAFE_DESC_KEYS.has(k)) dv[k] = v;
  return {
    transactionId: f.transaction_id || null,
    date: f.date || null,
    actionDate: f.action_date || null,
    category: f.category || null,
    subcategory: f.subcategory || null,
    type: f.type || null,
    description: f.description || null,
    descriptionValues: dv,
    pages: f.pages ?? null,
    documentUrl: f.links?.document_metadata || null,
  };
}

export function mapCharge(c) {
  return {
    chargeCode: c.charge_code || null,
    chargeNumber: c.charge_number ?? null,
    status: c.status || null,
    classification: c.classification?.description || null,
    createdOn: c.created_on || null,
    deliveredOn: c.delivered_on || null,
    satisfiedOn: c.satisfied_on || null,
    containsFloatingCharge: c.particulars?.contains_floating_charge ?? null,
    containsNegativePledge: c.particulars?.contains_negative_pledge ?? null,
    personsEntitledCount: Array.isArray(c.persons_entitled) ? c.persons_entitled.length : 0,
  };
}

export function mapInsolvency(doc) {
  return {
    status: doc?.status || null,
    cases: (doc?.cases || []).map((c) => ({
      type: c.type || null,
      number: c.number ?? null,
      dates: (c.dates || []).map((d) => ({ type: d.type, date: d.date })),
      // practitioners (names / addresses of individuals) intentionally dropped
    })),
  };
}

const withAttribution = (base) => ({ ...base, registerUrl: `https://find-and-update.company-information.service.gov.uk/company/${base.companyNumber}`, source: 'companies_house', retrievedAt: new Date().toISOString(), ...attributionFor('companies_house') });

function searchItem(i) {
  return {
    companyNumber: i.company_number,
    companyName: i.title || i.company_name || null,
    status: i.company_status || null,
    type: i.company_type || null,
    incorporatedOn: i.date_of_creation || null,
    dissolvedOn: i.date_of_cessation || null,
    sicCodes: i.sic_codes || [],
    registeredOfficeAddress: address(i.registered_office_address || i.address),
  };
}

export function createChClient({ apiKey, fetchImpl, limiter = defaultLimiter } = {}) {
  if (!apiKey || !String(apiKey).trim()) throw new Error('A Companies House API key is required. Create a free key at https://developer.company-information.service.gov.uk/ (REST API key) and paste it into the "Companies House API key" input.');
  const auth = `Basic ${Buffer.from(`${String(apiKey).trim()}:`).toString('base64')}`;
  async function get(p, { allow404 = false } = {}) {
    try {
      return await fetchJson(`${CH_BASE}${p}`, { fetchImpl, limiter, userAgent: UA, retries: 4, headers: { authorization: auth } });
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) throw new Error('Companies House rejected the API key (401). Check that it is a REST API key for the live environment.');
      if (allow404 && e instanceof HttpError && e.status === 404) return null;
      throw e;
    }
  }
  const profile = async (num) => {
    const p = await get(`/company/${normaliseCompanyNumber(num)}`, { allow404: true });
    return p ? mapProfile(p) : null;
  };
  async function enrich(rec, { filingHistory = 0, charges = false, insolvency = false } = {}) {
    const n = rec.companyNumber;
    if (filingHistory > 0) {
      const fh = await get(`/company/${n}/filing-history?items_per_page=${Math.min(filingHistory, 100)}`, { allow404: true });
      rec.filingHistory = (fh?.items || []).slice(0, filingHistory).map(mapFiling);
    }
    if (charges && rec.hasCharges !== false) {
      const ch = await get(`/company/${n}/charges?items_per_page=100`, { allow404: true });
      rec.charges = { total: ch?.total_count ?? 0, satisfied: ch?.satisfied_count ?? 0, partSatisfied: ch?.part_satisfied_count ?? 0, items: (ch?.items || []).map(mapCharge) };
    }
    if (insolvency && rec.hasInsolvencyHistory) {
      rec.insolvency = mapInsolvency(await get(`/company/${n}/insolvency`, { allow404: true }));
    }
    return rec;
  }
  async function* search(query, { maxResults = 100, fetchProfiles = true } = {}) {
    let start = 0;
    let emitted = 0;
    while (emitted < maxResults) {
      const size = Math.min(100, maxResults - emitted);
      const doc = await get(`/search/companies?q=${encodeURIComponent(query)}&items_per_page=${size}&start_index=${start}`);
      const items = doc?.items || [];
      for (const i of items) {
        const base = searchItem(i);
        yield (fetchProfiles && (await profile(base.companyNumber))) || withAttribution(base);
        if (++emitted >= maxResults) return;
      }
      start += items.length;
      if (!items.length || start >= (doc?.total_results ?? 0)) return;
    }
  }
  async function* advancedSearch(f = {}, { maxResults = 100, fetchProfiles = false } = {}) {
    const qs = new URLSearchParams();
    if (f.companyNameIncludes) qs.set('company_name_includes', f.companyNameIncludes);
    if (f.companyNameExcludes) qs.set('company_name_excludes', f.companyNameExcludes);
    for (const [k, p] of [['companyStatus', 'company_status'], ['companyType', 'company_type'], ['sicCodes', 'sic_codes'], ['companySubtype', 'company_subtype']]) {
      if (f[k]?.length) qs.set(p, [].concat(f[k]).join(','));
    }
    if (f.incorporatedFrom) qs.set('incorporated_from', f.incorporatedFrom);
    if (f.incorporatedTo) qs.set('incorporated_to', f.incorporatedTo);
    if (f.dissolvedFrom) qs.set('dissolved_from', f.dissolvedFrom);
    if (f.dissolvedTo) qs.set('dissolved_to', f.dissolvedTo);
    if (f.location) qs.set('location', f.location);
    if (![...qs.keys()].length) throw new Error('advanced_search needs at least one filter (companyNameIncludes, sicCodes, incorporatedFrom/To, location, companyStatus...).');
    let start = 0;
    let emitted = 0;
    while (emitted < maxResults) {
      const size = Math.min(5000, maxResults - emitted);
      qs.set('size', String(size));
      qs.set('start_index', String(start));
      const doc = await get(`/advanced-search/companies?${qs}`, { allow404: true }); // 404 = no hits
      const items = doc?.items || [];
      for (const i of items) {
        const base = searchItem(i);
        yield (fetchProfiles && (await profile(base.companyNumber))) || withAttribution(base);
        if (++emitted >= maxResults) return;
      }
      start += items.length;
      if (!items.length || start >= (doc?.hits ?? 0)) return;
    }
  }
  return { profile, enrich, search, advancedSearch };
}
