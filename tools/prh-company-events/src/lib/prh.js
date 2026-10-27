// Core library: PRH/YTJ company-events feed. Shared by the Apify actor and the MCP server.
// COMPANY-LEVEL FIELDS ONLY: output is built from an explicit whitelist; person-related data
// (c/o names, street/apartment addresses, representatives, board members) is never emitted.
import { attributionFor, createLimiter, fetchJson, uniq } from './common.js';

export const YTJ_BASE = 'https://avoindata.prh.fi/opendata-ytj-api/v3';
export const KREK_BASE = 'https://avoindata.prh.fi/opendata-registerednotices-api/v3';
// PRH publishes no numeric rate limit (only HTTP 429). Be conservative: max 1 request/second.
const limiter = createLimiter(1000);

/** Event types -> Trade Register entry codes (registered notices API, code list EC). */
export const EVENT_TYPES = {
  new_company: { label: 'New company registered', source: 'ytj' },
  name_change: { label: 'Company name changed', entryCodes: ['TMI'] },
  liquidation: { label: 'Liquidation started', entryCodes: ['SELAS'] },
  liquidation_ended: { label: 'Liquidation terminated', entryCodes: ['SELLOP'] },
  bankruptcy: { label: 'Bankruptcy', entryCodes: ['KONALK'] },
  bankruptcy_ended: { label: 'Bankruptcy terminated', entryCodes: ['KONLOP'] },
  restructuring: { label: 'Restructuring proceedings', entryCodes: ['SANALK'] },
  dissolution: { label: 'Dissolution / termination', entryCodes: ['LAKK'] },
  removal: { label: 'Removed from the register', entryCodes: ['POISTO'] },
  merger: { label: 'Merger implemented', entryCodes: ['SULLOP'] },
  demerger: { label: 'Demerger implemented', entryCodes: ['JAKLOP'] },
  registered_office_change: { label: 'Registered office (domicile) changed', entryCodes: ['KOTI'] },
  articles_amended: { label: 'Articles of association amended (may include line of business)', entryCodes: ['STA'] },
  industry_change: { label: 'Main line of business (TOL 2008) changed', source: 'derived' },
};
export const DEFAULT_EVENTS = ['new_company', 'name_change', 'liquidation', 'bankruptcy', 'restructuring', 'dissolution', 'industry_change'];

const ENTRY_LABELS = {
  TMI: 'Company name', TMIA: 'Auxiliary company name', TMIR: 'Parallel company name', SELAS: 'Liquidation', SELLOP: 'Termination of liquidation',
  KONALK: 'Bankruptcy', KONLOP: 'Termination of bankruptcy', SANALK: 'Restructuring proceedings', LAKK: 'Dissolution/termination',
  POISTO: 'Removal from the register', SULLOP: 'Implementation of merger', JAKLOP: 'Implementation of demerger', KOTI: 'Registered office',
  STA: 'Amendment to the articles of association', PERUS: 'Formation',
};
// Entry codes that are about PERSONS (board, signatories, auditors...). We keep only the fact that such an
// entry exists as a code; we never fetch or emit who the persons are.
export const PERSON_ENTRY_CODES = new Set(['HAL', 'HALE', 'TOIM', 'NIMA', 'NIMO', 'NIMOE', 'NIMP', 'NIMPE', 'SELM', 'SELME', 'YHM', 'YHME', 'JOH', 'JOHE', 'JOHT', 'HN', 'HNE', 'ALLEK', 'EDU', 'SANSEL', 'TAL', 'TALA', 'ESR', 'ISAN', 'ASTO']);

const SITUATION_LABELS = { SELTILA: 'Liquidation', KONK: 'Bankruptcy', SANE: 'Restructuring' };
const pickDesc = (descs, lang) => (descs || []).find((d) => d.languageCode === lang)?.description || null; // 1=fi 2=sv 3=en

function currentName(c) {
  const names = (c.names || []).filter((n) => n.type === '1');
  return (names.find((n) => n.version === 1 && !n.endDate) || names.sort((a, b) => a.version - b.version)[0])?.name || null;
}
function previousName(c, onDate) {
  const prev = (c.names || []).filter((n) => n.type === '1' && n.version > 1).sort((a, b) => (b.endDate || '').localeCompare(a.endDate || ''));
  return (onDate ? prev.find((n) => n.endDate === onDate) : null)?.name || prev[0]?.name || null;
}

/** Whitelist mapper: raw PRH company -> company-level record. */
export function companyLevel(c) {
  const form = (c.companyForms || []).find((f) => !f.endDate) || (c.companyForms || [])[0];
  const mbl = c.mainBusinessLine;
  const addr = (c.addresses || []).find((a) => a.type === 1) || (c.addresses || [])[0];
  const city = addr ? (addr.postOffices || []).find((p) => p.languageCode === '1')?.city || addr.postOffices?.[0]?.city || null : null;
  return {
    businessId: c.businessId?.value || null,
    euId: c.euId?.value || null,
    companyName: currentName(c),
    auxiliaryNames: uniq((c.names || []).filter((n) => n.type === '3' && !n.endDate).map((n) => n.name)),
    companyForm: form ? { code: form.type, en: pickDesc(form.descriptions, '3'), fi: pickDesc(form.descriptions, '1') } : null,
    mainBusinessLine: mbl ? { tol2008: mbl.type, en: pickDesc(mbl.descriptions, '3'), fi: pickDesc(mbl.descriptions, '1'), since: mbl.registrationDate || null } : null,
    situations: (c.companySituations || []).filter((s) => !s.endDate).map((s) => ({ type: s.type, label: SITUATION_LABELS[s.type] || s.type, since: s.registrationDate || null })),
    // Only municipality-level location. Street, building, apartment, PO box and c/o are dropped (can identify persons).
    location: addr ? { postCode: addr.postCode || null, city, municipalityCode: addr.postOffices?.[0]?.municipalityCode || null } : null,
    website: c.website?.url || null,
    companyRegistrationDate: c.registrationDate || null,
    endDate: c.endDate || null,
    tradeRegisterStatus: c.tradeRegisterStatus ?? null,
    status: c.status ?? null,
    lastModified: c.lastModified || null,
    sourceApiUrl: c.businessId?.value ? `${YTJ_BASE}/companies?businessId=${c.businessId.value}` : null,
  };
}

function eventRecord(eventType, c, { eventDate, recordNumber = null, entryCodes = [], extra = {}, retrievedAt }) {
  const base = companyLevel(c);
  return {
    eventType,
    eventLabel: EVENT_TYPES[eventType]?.label || eventType,
    eventDate,
    recordNumber,
    // keep only non-person entry codes; person-related codes are reduced to a boolean
    entryCodes: entryCodes.filter((e) => !PERSON_ENTRY_CODES.has(e)),
    entryLabels: entryCodes.filter((e) => !PERSON_ENTRY_CODES.has(e)).map((e) => ENTRY_LABELS[e] || e),
    includesRepresentationChanges: entryCodes.some((e) => PERSON_ENTRY_CODES.has(e)),
    ...base,
    ...extra,
    eventKey: `${eventType}|${base.businessId}|${recordNumber || eventDate}`,
    source: 'PRH avoindata (YTJ / Trade Register)',
    retrievedAt,
    ...attributionFor('prh'),
  };
}

async function paged(baseUrl, params, { fetchImpl, pageSize, maxItems }) {
  const out = [];
  let total = null;
  for (let page = 1; page < 1000; page++) {
    const qs = new URLSearchParams({ ...params, page: String(page) });
    const res = await fetchJson(`${baseUrl}?${qs}`, { fetchImpl, limiter });
    total = res?.totalResults ?? total;
    const cs = res?.companies || [];
    out.push(...cs);
    if (cs.length < pageSize || out.length >= (total ?? Infinity) || out.length >= maxItems) break;
  }
  return { total, companies: out.slice(0, maxItems) };
}

const inWindow = (d, from, to) => d && d >= from && d <= to;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Fetch company events for a date window [dateFrom, dateTo] (YYYY-MM-DD, inclusive).
 * Returns { records, stats }.
 */
export async function fetchEvents({ eventTypes = DEFAULT_EVENTS, dateFrom, dateTo, location, companyForm, maxPerEvent = 500 } = {}, { fetchImpl } = {}) {
  if (!DATE_RE.test(dateFrom || '') || !DATE_RE.test(dateTo || '')) throw new Error('dateFrom and dateTo are required (YYYY-MM-DD)');
  if (dateFrom > dateTo) throw new Error('dateFrom must be <= dateTo');
  for (const t of eventTypes) if (!EVENT_TYPES[t]) throw new Error(`Unknown event type "${t}". Known: ${Object.keys(EVENT_TYPES).join(', ')}`);
  const retrievedAt = new Date().toISOString();
  const filters = {};
  if (location) filters.location = String(location);
  if (companyForm) filters.companyForm = String(companyForm);
  const records = [];
  const stats = {};
  const seenCompanies = new Map();

  if (eventTypes.includes('new_company')) {
    const { total, companies } = await paged(`${YTJ_BASE}/companies`, { registrationDateStart: dateFrom, registrationDateEnd: dateTo, ...filters }, { fetchImpl, pageSize: 100, maxItems: maxPerEvent });
    stats.new_company = { upstreamTotal: total, fetched: companies.length };
    for (const c of companies) {
      seenCompanies.set(c.businessId?.value, c);
      records.push(eventRecord('new_company', c, { eventDate: c.registrationDate, retrievedAt }));
    }
  }
  for (const t of eventTypes) {
    const def = EVENT_TYPES[t];
    if (!def.entryCodes) continue;
    for (const code of def.entryCodes) {
      const { total, companies } = await paged(`${KREK_BASE}/`, { noticeRegistrationDateStart: dateFrom, noticeRegistrationDateEnd: dateTo, entryCode: code, ...filters }, { fetchImpl, pageSize: 50, maxItems: maxPerEvent });
      stats[t] = { upstreamTotal: total, fetched: companies.length };
      for (const c of companies) {
        seenCompanies.set(c.businessId?.value, c);
        const notices = (c.publicNotices || []).filter((n) => (n.entryCodes || []).includes(code) && inWindow(n.registrationDate, dateFrom, dateTo));
        for (const n of notices.length ? notices : [{ registrationDate: dateTo, recordNumber: null, entryCodes: [code] }]) {
          const extra = t === 'name_change' ? { previousName: previousName(c, n.registrationDate) } : {};
          records.push(eventRecord(t, c, { eventDate: n.registrationDate, recordNumber: n.recordNumber, entryCodes: n.entryCodes || [], extra, retrievedAt }));
        }
      }
    }
  }
  if (eventTypes.includes('industry_change')) {
    // Derived: among companies seen in this window, those whose main line of business has a registration date inside the window
    // (excluding brand-new companies). Full-register coverage needs watchlist mode or the bulk file (see README).
    let n = 0;
    for (const c of seenCompanies.values()) {
      const since = c.mainBusinessLine?.registrationDate;
      if (inWindow(since, dateFrom, dateTo) && !inWindow(c.registrationDate, dateFrom, dateTo)) {
        records.push(eventRecord('industry_change', c, { eventDate: since, retrievedAt, extra: { detection: 'window-companies' } }));
        n++;
      }
    }
    stats.industry_change = { detected: n, coverage: 'companies with other events in the window; use watchlist for full coverage' };
  }
  return { records: dedupeEvents(records), stats };
}

export function dedupeEvents(records) {
  const m = new Map();
  for (const r of records) if (!m.has(r.eventKey)) m.set(r.eventKey, r);
  return [...m.values()];
}

/** Snapshot used for watchlist diffs (company-level only). */
export function snapshot(c) {
  const b = companyLevel(c);
  return { companyName: b.companyName, companyForm: b.companyForm?.code || null, tol2008: b.mainBusinessLine?.tol2008 || null, situations: b.situations.map((s) => s.type).sort().join(',') || null, city: b.location?.city || null, status: b.status, tradeRegisterStatus: b.tradeRegisterStatus, endDate: b.endDate };
}

const DIFF_EVENTS = { companyName: 'name_change', tol2008: 'industry_change', companyForm: 'company_form_change', situations: 'situation_change', city: 'location_change', status: 'status_change', tradeRegisterStatus: 'status_change', endDate: 'status_change' };
EVENT_TYPES.company_form_change = { label: 'Company form changed', source: 'watchlist' };
EVENT_TYPES.situation_change = { label: 'Company situation changed (liquidation/bankruptcy/restructuring)', source: 'watchlist' };
EVENT_TYPES.location_change = { label: 'Registered location (municipality) changed', source: 'watchlist' };
EVENT_TYPES.status_change = { label: 'Register status changed', source: 'watchlist' };

/** Watchlist: compare current state of given Business IDs with previous snapshots. */
export async function watchCompanies(businessIds, prevSnapshots = {}, { fetchImpl } = {}) {
  const retrievedAt = new Date().toISOString();
  const today = retrievedAt.slice(0, 10);
  const ids = uniq(businessIds.map((b) => String(b).trim()));
  for (const id of ids) if (!/^\d{7}-\d$/.test(id)) throw new Error(`Invalid Business ID "${id}" (format 1234567-8)`);
  const snapshots = { ...prevSnapshots };
  const records = [];
  const notFound = [];
  for (const id of ids) {
    const res = await fetchJson(`${YTJ_BASE}/companies?${new URLSearchParams({ businessId: id })}`, { fetchImpl, limiter });
    const c = res?.companies?.[0];
    if (!c) { notFound.push(id); continue; }
    const now = snapshot(c);
    const prev = prevSnapshots[id];
    if (prev) {
      const emitted = new Set();
      for (const [field, ev] of Object.entries(DIFF_EVENTS)) {
        if ((prev[field] ?? null) !== (now[field] ?? null) && !emitted.has(ev)) {
          emitted.add(ev);
          records.push(eventRecord(ev, c, { eventDate: today, retrievedAt, extra: { detection: 'watchlist-diff', changedField: field, previousValue: prev[field] ?? null, newValue: now[field] ?? null, ...(ev === 'name_change' ? { previousName: prev.companyName } : {}) } }));
        }
      }
    }
    snapshots[id] = now;
  }
  return { records, snapshots, notFound, firstSeen: ids.filter((i) => !prevSnapshots[i] && !notFound.includes(i)) };
}

/** Alert helper: drop events already delivered (by eventKey). */
export function filterNewEvents(records, state = {}, { keepDays = 90, now = new Date() } = {}) {
  const seen = { ...(state.seen || {}) };
  const fresh = records.filter((r) => !seen[r.eventKey]);
  for (const r of records) seen[r.eventKey] = seen[r.eventKey] || now.toISOString().slice(0, 10);
  const cutoff = new Date(now.getTime() - keepDays * 864e5).toISOString().slice(0, 10);
  for (const [k, d] of Object.entries(seen)) if (d < cutoff) delete seen[k];
  return { fresh, state: { ...state, seen, lastRunAt: now.toISOString() } };
}

/** Default window: yesterday (PRH updates once a day). In alert mode: since last run minus 2 days overlap. */
export function defaultWindow(state, now = new Date()) {
  const d = (x) => x.toISOString().slice(0, 10);
  const to = d(new Date(now.getTime() - 864e5));
  const from = state?.lastRunAt ? d(new Date(new Date(state.lastRunAt).getTime() - 2 * 864e5)) : to;
  return { dateFrom: from <= to ? from : to, dateTo: to };
}
