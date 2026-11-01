// Norway mode: Brønnøysund Register Centre - Enhetsregisteret (data.brreg.no), NLOD 2.0, no key.
// Same record shape as the PRH feed (eventKey, eventType, eventDate, businessId, companyName, companyForm,
// mainBusinessLine, location, attribution) plus country/registry and Norwegian-specific sub-fields.
// COMPANY-LEVEL ONLY: sole proprietorships (ENK) and person registrations (PERS) are dropped; /roller is never
// called; addresses are reduced to postcode/town/municipality; free-text 'aktivitet', e-mail, phone and mobile
// are never output.
import { attributionFor, createLimiter, fetchJson, HttpError, uniq } from './common.js';
import { EVENT_TYPES, DEFAULT_EVENTS } from './prh.js';

export const BRREG_BASE = 'https://data.brreg.no/enhetsregisteret/api';
const limiter = createLimiter(250); // no published limit; stay at <= 4 req/s
const UA = 'prh-company-events/0.2 (Apify actor by itulo, Norway mode; +https://github.com/itulo/eu-nordic-open-data-mcp)';
export const PERSON_FORMS = new Set(['ENK', 'PERS']);
export const NO_SUPPORTED = ['new_company', 'name_change', 'liquidation', 'bankruptcy', 'dissolution', 'removal', 'registered_office_change', 'industry_change'];
export const NO_DEFAULT_EVENTS = DEFAULT_EVENTS.filter((t) => NO_SUPPORTED.includes(t));
const FORM_EN = {
  AS: 'Private limited company', ASA: 'Public limited company', ANS: 'General partnership (joint liability)', DA: 'General partnership (shared liability)',
  KS: 'Limited partnership', SA: 'Cooperative', STI: 'Foundation', NUF: 'Norwegian branch of a foreign company', BA: 'Company with limited liability',
  FLI: 'Association/club', SF: 'State enterprise', IKS: 'Inter-municipal company', KF: 'Municipal enterprise', BRL: 'Housing cooperative',
  ESEK: 'Housing condominium', SAM: 'Co-ownership', ORGL: 'Organisational unit', ANNA: 'Other legal entity', PK: 'Pension fund', SPA: 'Savings bank',
  GFS: 'Mutual insurance company', KIRK: 'Church of Norway', STAT: 'State', KOMM: 'Municipality', FYLK: 'County', AAFY: 'Sub-entity', BEDR: 'Sub-entity (business)',
};
export const ORGNR_RE = /^\d{9}$/;
export const normaliseOrgnr = (s) => String(s || '').replace(/[\s.-]/g, '').replace(/^NO/i, '').replace(/MVA$/i, '');

const get = (path, fetchImpl) => fetchJson(`${BRREG_BASE}${path}`, { fetchImpl, limiter, userAgent: UA, headers: { accept: 'application/json' } });
async function getEntity(orgnr, fetchImpl) {
  try { return await get(`/enheter/${orgnr}`, fetchImpl); } catch (e) { if (e instanceof HttpError && (e.status === 404 || e.status === 410)) return null; throw e; }
}

export const isPersonEntity = (e) => PERSON_FORMS.has(e?.organisasjonsform?.kode);

function previousNameOf(e) {
  const h = (e?.historiskeNavn || []).slice().sort((a, b) => String(b.tilDato || '').localeCompare(String(a.tilDato || '')));
  return h[0]?.navn || null;
}

/** Whitelist mapper: Brreg entity -> company-level record in the PRH shape. */
export function companyLevelNo(e) {
  const f = e.organisasjonsform || {};
  const n = e.naeringskode1 || null;
  const a = e.forretningsadresse || e.postadresse || null;
  const situations = [];
  if (e.konkurs) situations.push({ type: 'KONKURS', label: 'Bankruptcy', since: e.konkursdato || null });
  if (e.underAvvikling) situations.push({ type: 'UNDER_AVVIKLING', label: 'Liquidation', since: e.underAvviklingDato || null });
  if (e.underTvangsavviklingEllerTvangsopplosning) situations.push({ type: 'TVANGSAVVIKLING', label: 'Compulsory liquidation/dissolution', since: e.tvangsavvikletPgaManglendeSlettingDato || e.tvangsopplostPgaManglendeDagligLederDato || null });
  const deleted = e.respons_klasse === 'SlettetEnhet' || !!e.slettedato;
  return {
    country: 'NO',
    registry: 'no_brreg',
    businessId: e.organisasjonsnummer || null,
    euId: null,
    companyName: e.navn || null,
    auxiliaryNames: [],
    companyForm: f.kode ? { code: f.kode, en: FORM_EN[f.kode] || null, fi: null, no: f.beskrivelse || null } : null,
    mainBusinessLine: n ? { tol2008: null, en: null, fi: null, since: null, naceCode: n.kode || null, no: n.beskrivelse || null } : null,
    situations,
    location: a ? { postCode: a.postnummer || null, city: a.poststed || null, municipalityCode: a.kommunenummer || null } : null,
    website: e.hjemmeside || null,
    companyRegistrationDate: e.registreringsdatoEnhetsregisteret || null,
    foundedDate: e.stiftelsesdato || null,
    endDate: e.slettedato || null,
    tradeRegisterStatus: e.registrertIForetaksregisteret ?? null,
    status: deleted ? 'deleted' : 'registered',
    employees: e.harRegistrertAntallAnsatte ? (e.antallAnsatte ?? null) : null,
    vatRegistered: e.registrertIMvaregisteret ?? null,
    lastModified: null,
    sourceApiUrl: e.organisasjonsnummer ? `${BRREG_BASE}/enheter/${e.organisasjonsnummer}` : null,
  };
}

function eventRecordNo(eventType, e, { eventDate, recordNumber = null, extra = {}, retrievedAt }) {
  const base = companyLevelNo(e);
  return {
    eventType,
    eventLabel: EVENT_TYPES[eventType]?.label || eventType,
    eventDate,
    recordNumber,
    entryCodes: [],
    entryLabels: [],
    includesRepresentationChanges: false,
    ...base,
    previousName: null,
    ...extra,
    eventKey: `${eventType}|${base.businessId}|${recordNumber || eventDate}`,
    source: 'Brønnøysundregistrene - Enhetsregisteret (data.brreg.no)',
    retrievedAt,
    ...attributionFor('brreg'),
  };
}

/** Classify one update-feed item (JSON-patch 'endringer') into event types. */
export function classifyUpdate(u) {
  const out = new Set();
  if (u.endringstype === 'Sletting') out.add('removal');
  if (u.endringstype === 'Ny') out.add('new_company_feed');
  for (const c of u.endringer || []) {
    const p = c.path || '';
    if (p === '/navn' && c.op === 'replace') out.add('name_change');
    if ((p === '/konkurs' && c.value === true) || (p === '/konkursdato' && c.op === 'add')) out.add('bankruptcy');
    if ((p === '/underAvvikling' && c.value === true) || (p === '/underAvviklingDato' && c.op === 'add')) out.add('liquidation');
    if (p === '/underTvangsavviklingEllerTvangsopplosning' && c.value === true) out.add('dissolution');
    if (p === '/slettedato' && c.op === 'add') out.add('removal');
    if ((p === '/naeringskode1/kode' && c.op === 'replace') || (p === '/naeringskode1' && c.op === 'replace')) out.add('industry_change');
    if (p === '/forretningsadresse/kommunenummer' && c.op === 'replace') out.add('registered_office_change');
  }
  return out;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const matchLocation = (rec, location) => !location || [rec.location?.city, rec.location?.municipalityCode].some((v) => v && String(v).toLowerCase() === String(location).toLowerCase());
const matchForm = (rec, form) => !form || rec.companyForm?.code === String(form).toUpperCase();

/** Norway equivalent of fetchEvents(). Returns { records, stats }. */
export async function fetchEventsNo({ eventTypes = NO_DEFAULT_EVENTS, dateFrom, dateTo, location, companyForm, maxPerEvent = 500 } = {}, { fetchImpl } = {}) {
  if (!DATE_RE.test(dateFrom || '') || !DATE_RE.test(dateTo || '')) throw new Error('dateFrom and dateTo are required (YYYY-MM-DD)');
  if (dateFrom > dateTo) throw new Error('dateFrom must be <= dateTo');
  for (const t of eventTypes) if (!EVENT_TYPES[t]) throw new Error(`Unknown event type "${t}". Known: ${Object.keys(EVENT_TYPES).join(', ')}`);
  const retrievedAt = new Date().toISOString();
  const wanted = eventTypes.filter((t) => NO_SUPPORTED.includes(t));
  const stats = { registry: 'no_brreg', excludedPersonEntities: 0 };
  const unsupported = eventTypes.filter((t) => !NO_SUPPORTED.includes(t));
  if (unsupported.length) stats.unsupportedInNorway = unsupported;
  const records = [];
  const counts = Object.fromEntries(wanted.map((t) => [t, 0]));

  if (wanted.includes('new_company')) {
    let fetched = 0; let total = null;
    for (let page = 0; counts.new_company < maxPerEvent && (page + 1) * 100 <= 10000; page++) {
      const qs = new URLSearchParams({ fraRegistreringsdatoEnhetsregisteret: dateFrom, tilRegistreringsdatoEnhetsregisteret: dateTo, size: '100', page: String(page) });
      if (companyForm) qs.set('organisasjonsform', String(companyForm).toUpperCase());
      const doc = await get(`/enheter?${qs}`, fetchImpl);
      total = doc?.page?.totalElements ?? total;
      const list = doc?._embedded?.enheter || [];
      for (const e of list) {
        fetched++;
        if (isPersonEntity(e)) { stats.excludedPersonEntities++; continue; }
        const rec = eventRecordNo('new_company', e, { eventDate: e.registreringsdatoEnhetsregisteret, retrievedAt });
        if (!matchLocation(rec, location)) continue;
        records.push(rec);
        if (++counts.new_company >= maxPerEvent) break;
      }
      if (!list.length || page + 1 >= (doc?.page?.totalPages || 0)) break;
    }
    stats.new_company = { upstreamTotal: total, fetched, returned: counts.new_company };
  }

  const feedTypes = wanted.filter((t) => t !== 'new_company');
  if (feedTypes.length) {
    // Update feed with JSON-patch changes, cursor-paged by oppdateringsid.
    const candidates = new Map(); // orgnr -> { types:Set, date, id }
    let cursor = null; let scanned = 0;
    for (let guard = 0; guard < 200; guard++) {
      const qs = new URLSearchParams({ dato: `${dateFrom}T00:00:00.000Z`, updatedBefore: `${dateTo}T23:59:59.999Z`, includeChanges: 'true', size: '2000' });
      if (cursor) qs.set('oppdateringsid', String(cursor));
      const doc = await get(`/oppdateringer/enheter?${qs}`, fetchImpl);
      const items = doc?._embedded?.oppdaterteEnheter || [];
      for (const u of items) {
        scanned++;
        const types = [...classifyUpdate(u)].filter((t) => feedTypes.includes(t));
        if (!types.length) continue;
        const prev = candidates.get(u.organisasjonsnummer) || { types: new Set(), date: null, id: null };
        types.forEach((t) => prev.types.add(t));
        prev.date = String(u.dato || '').slice(0, 10);
        prev.id = u.oppdateringsid;
        candidates.set(u.organisasjonsnummer, prev);
      }
      if (items.length < 2000) break;
      cursor = items[items.length - 1].oppdateringsid + 1;
    }
    stats.updateFeed = { scanned, candidates: candidates.size };
    for (const [orgnr, c] of candidates) {
      if (feedTypes.every((t) => counts[t] >= maxPerEvent)) break;
      if ([...c.types].every((t) => counts[t] >= maxPerEvent)) continue; // nothing left to fill for this candidate
      const e = await getEntity(orgnr, fetchImpl);
      if (!e) continue;
      if (isPersonEntity(e)) { stats.excludedPersonEntities++; continue; }
      for (const t of c.types) {
        if (counts[t] >= maxPerEvent) continue;
        const extra = t === 'name_change' ? { previousName: previousNameOf(e) } : {};
        const rec = eventRecordNo(t, e, { eventDate: t === 'removal' && e.slettedato ? e.slettedato : c.date, recordNumber: c.id, extra, retrievedAt });
        if (!matchLocation(rec, location) || !matchForm(rec, companyForm)) continue;
        records.push(rec);
        counts[t]++;
      }
    }
    for (const t of feedTypes) stats[t] = { returned: counts[t] };
  }
  return { records, stats };
}

/** Snapshot used for watchlist diffs (company-level only, same keys as the PRH snapshot). */
export function snapshotNo(e) {
  const b = companyLevelNo(e);
  return { companyName: b.companyName, companyForm: b.companyForm?.code || null, tol2008: b.mainBusinessLine?.naceCode || null, situations: b.situations.map((s) => s.type).sort().join(',') || null, city: b.location?.city || null, status: b.status, tradeRegisterStatus: b.tradeRegisterStatus, endDate: b.endDate };
}
const DIFF_EVENTS = { companyName: 'name_change', tol2008: 'industry_change', companyForm: 'company_form_change', situations: 'situation_change', city: 'location_change', status: 'status_change', tradeRegisterStatus: 'status_change', endDate: 'status_change' };

/** Watchlist for Norwegian organisation numbers (9 digits). */
export async function watchCompaniesNo(orgnrs, prevSnapshots = {}, { fetchImpl } = {}) {
  const retrievedAt = new Date().toISOString();
  const today = retrievedAt.slice(0, 10);
  const ids = uniq(orgnrs.map(normaliseOrgnr));
  for (const id of ids) if (!ORGNR_RE.test(id)) throw new Error(`Invalid Norwegian organisation number "${id}" (9 digits)`);
  const snapshots = { ...prevSnapshots };
  const records = []; const notFound = []; const excluded = [];
  for (const id of ids) {
    const e = await getEntity(id, fetchImpl);
    if (!e) { notFound.push(id); continue; }
    if (isPersonEntity(e)) { excluded.push(id); continue; }
    const now = snapshotNo(e);
    const prev = prevSnapshots[id];
    if (prev) {
      const emitted = new Set();
      for (const [field, ev] of Object.entries(DIFF_EVENTS)) {
        if ((prev[field] ?? null) !== (now[field] ?? null) && !emitted.has(ev)) {
          emitted.add(ev);
          records.push(eventRecordNo(ev, e, { eventDate: today, retrievedAt, extra: { detection: 'watchlist-diff', changedField: field, previousValue: prev[field] ?? null, newValue: now[field] ?? null, ...(ev === 'name_change' ? { previousName: prev.companyName } : {}) } }));
        }
      }
    }
    snapshots[id] = now;
  }
  return { records, snapshots, notFound, excludedPersonEntities: excluded.length, firstSeen: ids.filter((i) => !prevSnapshots[i] && !notFound.includes(i) && !excluded.includes(i)) };
}

/** Single company lookup (company-level), null if not found or a person entity. */
export async function lookupNo(orgnr, { fetchImpl } = {}) {
  const id = normaliseOrgnr(orgnr);
  if (!ORGNR_RE.test(id)) throw new Error(`Invalid Norwegian organisation number "${orgnr}" (9 digits)`);
  const e = await getEntity(id, fetchImpl);
  if (!e) return { businessId: id, found: false };
  if (isPersonEntity(e)) return { businessId: id, found: true, withheld: true, reason: 'Sole proprietorship (ENK) / person registration - withheld under the company-level-only policy.' };
  return { found: true, ...companyLevelNo(e), ...attributionFor('brreg') };
}
