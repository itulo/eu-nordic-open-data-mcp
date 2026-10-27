// Core library for the TED EU tender feed. Used by both the Apify actor (src/main.js) and the MCP server (src/mcp-server.js).
import { attributionFor, createLimiter, fetchJson, uniq } from './common.js';

export const TED_SEARCH_URL = 'https://api.ted.europa.eu/v3/notices/search';
// TED fair-usage: 700 requests/minute. We stay far below: max 1 request / 250 ms per process.
const limiter = createLimiter(250);

// Only organisation-level fields. Deliberately NOT requested: contact persons, e-mails, phones,
// jury members, winner/tenderer names (can be natural persons) -> GDPR minimisation.
export const FIELDS = [
  'publication-number', 'notice-identifier', 'notice-version', 'procedure-identifier', 'notice-type',
  'notice-title', 'buyer-name', 'buyer-identifier', 'organisation-country-buyer', 'place-of-performance-country-lot',
  'classification-cpv', 'publication-date', 'dispatch-date', 'deadline-receipt-tender-date-lot', 'procedure-type',
  'contract-nature', 'estimated-value-proc', 'estimated-value-cur-proc', 'estimated-value-lot', 'estimated-value-cur-lot',
];

// ISO 3166 alpha-2 -> alpha-3 for EU/EEA + common TED countries (TED uses alpha-3).
export const ISO2_TO_ISO3 = {
  AT: 'AUT', BE: 'BEL', BG: 'BGR', HR: 'HRV', CY: 'CYP', CZ: 'CZE', DK: 'DNK', EE: 'EST', FI: 'FIN', FR: 'FRA', DE: 'DEU',
  GR: 'GRC', EL: 'GRC', HU: 'HUN', IE: 'IRL', IT: 'ITA', LV: 'LVA', LT: 'LTU', LU: 'LUX', MT: 'MLT', NL: 'NLD', PL: 'POL',
  PT: 'PRT', RO: 'ROU', SK: 'SVK', SI: 'SVN', ES: 'ESP', SE: 'SWE', NO: 'NOR', IS: 'ISL', LI: 'LIE', CH: 'CHE', UK: 'GBR',
  GB: 'GBR', UA: 'UKR', MD: 'MDA', RS: 'SRB', ME: 'MNE', MK: 'MKD', AL: 'ALB', BA: 'BIH', TR: 'TUR', GE: 'GEO',
};

export const NOTICE_TYPE_LABELS = {
  'pin-only': 'Prior information notice (information only)', 'pin-buyer': 'Prior information notice (buyer profile)',
  'pin-rtl': 'Prior information notice (reducing time limits)', 'pin-cfc-standard': 'PIN used as call for competition',
  'pin-cfc-social': 'PIN call for competition (social)', 'pin-tran': 'PIN (public passenger transport)',
  'cn-standard': 'Contract notice', 'cn-social': 'Contract notice (social & other specific services)',
  'cn-desg': 'Design contest notice', 'subco': 'Subcontracting notice', 'qu-sy': 'Qualification system notice',
  'can-standard': 'Contract award notice', 'can-social': 'Contract award notice (social)', 'can-desg': 'Design contest result',
  'can-tran': 'Contract award notice (transport)', 'can-modif': 'Contract modification notice', 'veat': 'Voluntary ex-ante transparency notice',
  'corr': 'Corrigendum', 'compl': 'Contract completion notice',
};

// Convenience groups for input
export const NOTICE_TYPE_GROUPS = {
  competition: ['cn-standard', 'cn-social', 'cn-desg', 'pin-cfc-standard', 'pin-cfc-social', 'qu-sy', 'subco'],
  planning: ['pin-only', 'pin-buyer', 'pin-rtl', 'pin-tran'],
  award: ['can-standard', 'can-social', 'can-desg', 'can-tran', 'veat', 'can-modif'],
  change: ['corr'],
};

const CPV_RE = /^\d{8}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function normaliseCountry(c) {
  const u = String(c || '').trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(u)) return u;
  if (ISO2_TO_ISO3[u]) return ISO2_TO_ISO3[u];
  throw new Error(`Unknown country code "${c}" (use ISO alpha-2 like FI or alpha-3 like FIN)`);
}

export function normaliseCpv(c) {
  const digits = String(c || '').replace(/[^0-9]/g, '').slice(0, 8);
  if (!CPV_RE.test(digits)) throw new Error(`Invalid CPV code "${c}" (8 digits, e.g. 72000000 or 72000000-5)`);
  return digits;
}

const ymd = (d) => d.replace(/-/g, '');

/** Build a TED expert query. All values are validated, so no user text is injected into the query verbatim. */
export function buildQuery({ cpvCodes = [], countries = [], countryField = 'buyer', publishedFrom, publishedTo, noticeTypes = [] } = {}) {
  const parts = [];
  const cpvs = uniq(cpvCodes.map(normaliseCpv));
  if (cpvs.length) parts.push(`classification-cpv IN (${cpvs.join(' ')})`);
  const ctry = uniq(countries.map(normaliseCountry));
  if (ctry.length) {
    const field = countryField === 'performance' ? 'place-of-performance' : 'organisation-country-buyer';
    parts.push(`${field} IN (${ctry.join(' ')})`);
  }
  for (const [d, op] of [[publishedFrom, '>='], [publishedTo, '<=']]) {
    if (!d) continue;
    if (!DATE_RE.test(d)) throw new Error(`Invalid date "${d}" (YYYY-MM-DD)`);
    parts.push(`publication-date${op}${ymd(d)}`);
  }
  const types = uniq(noticeTypes.flatMap((t) => NOTICE_TYPE_GROUPS[t] || [t]));
  for (const t of types) if (!/^[a-z-]+$/.test(t)) throw new Error(`Invalid notice type "${t}"`);
  if (types.length) parts.push(`notice-type IN (${types.join(' ')})`);
  if (!parts.length) throw new Error('At least one filter (cpvCodes, countries or dates) is required');
  return parts.join(' AND ') + ' SORT BY publication-number DESC';
}

const LANG_PREF = ['eng', 'fra', 'deu'];
function pickLang(obj, preferred) {
  if (!obj || typeof obj !== 'object') return { text: null, lang: null };
  const order = [preferred, ...LANG_PREF].filter(Boolean);
  for (const l of order) if (obj[l]) return { text: Array.isArray(obj[l]) ? obj[l][0] : obj[l], lang: l };
  const k = Object.keys(obj)[0];
  return k ? { text: Array.isArray(obj[k]) ? obj[k][0] : obj[k], lang: k } : { text: null, lang: null };
}
const arr = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
const tedDate = (s) => (s ? String(s).slice(0, 10) : null); // "2026-09-01+02:00" -> "2026-09-01"

/** Normalise one raw TED notice to our flat, company-level output schema. */
export function normaliseNotice(n, { language = 'eng', retrievedAt = new Date().toISOString() } = {}) {
  const title = pickLang(n['notice-title'], language);
  const buyers = n['buyer-name'] ? uniq(Object.values(n['buyer-name']).flat()) : [];
  const deadlines = uniq(arr(n['deadline-receipt-tender-date-lot']).map(tedDate)).sort();
  const cpv = uniq(arr(n['classification-cpv']));
  const procValue = n['estimated-value-proc'] ? Number(n['estimated-value-proc']) : null;
  const lotValues = arr(n['estimated-value-lot']).map(Number).filter(Number.isFinite);
  const value = procValue ?? (lotValues.length ? lotValues.reduce((a, b) => a + b, 0) : null);
  const currency = n['estimated-value-cur-proc'] || arr(n['estimated-value-cur-lot'])[0] || null;
  const pn = n['publication-number'];
  const langCode2 = { eng: 'en', fra: 'fr', deu: 'de', fin: 'fi', swe: 'sv' }[language] || 'en';
  return {
    publicationNumber: pn,
    noticeId: n['notice-identifier'] || null,
    noticeVersion: n['notice-version'] ?? null,
    procedureId: n['procedure-identifier'] || null,
    noticeType: n['notice-type'] || null,
    noticeTypeLabel: NOTICE_TYPE_LABELS[n['notice-type']] || null,
    title: title.text,
    titleLanguage: title.lang,
    buyerNames: buyers,
    buyerIds: uniq(arr(n['buyer-identifier'])),
    buyerCountries: uniq(arr(n['organisation-country-buyer'])),
    performanceCountries: uniq(arr(n['place-of-performance-country-lot'])),
    cpvCodes: cpv,
    mainCpv: cpv[0] || null,
    publicationDate: tedDate(n['publication-date']),
    dispatchDate: tedDate(n['dispatch-date']),
    tenderDeadline: deadlines[0] || null,
    procedureType: n['procedure-type'] || null,
    contractNature: uniq(arr(n['contract-nature'])),
    estimatedValue: value !== null ? { amount: value, currency } : null,
    url: pn ? `https://ted.europa.eu/${langCode2}/notice/-/detail/${pn}` : null,
    pdfUrl: pn ? `https://ted.europa.eu/${langCode2}/notice/${pn}/pdf` : null,
    xmlUrl: pn ? `https://ted.europa.eu/en/notice/${pn}/xml` : null,
    source: 'TED - Tenders Electronic Daily',
    retrievedAt,
    ...attributionFor('ted'),
  };
}

/** Deduplicate by publication number; optionally collapse to the latest notice per procedure. */
export function dedupe(records, { collapseByProcedure = false } = {}) {
  const byPn = new Map();
  for (const r of records) if (r.publicationNumber && !byPn.has(r.publicationNumber)) byPn.set(r.publicationNumber, r);
  let out = [...byPn.values()];
  if (collapseByProcedure) {
    const byProc = new Map();
    const pnKey = (pn) => { const [num, yr] = String(pn).split('-'); return Number(yr) * 1e9 + Number(num); };
    for (const r of out) {
      const k = r.procedureId || `pn:${r.publicationNumber}`;
      const prev = byProc.get(k);
      if (!prev || pnKey(r.publicationNumber) > pnKey(prev.publicationNumber)) {
        byProc.set(k, { ...r, relatedPublicationNumbers: uniq([...(prev?.relatedPublicationNumbers || []), ...(prev ? [prev.publicationNumber] : [])]) });
      } else {
        prev.relatedPublicationNumbers = uniq([...(prev.relatedPublicationNumbers || []), r.publicationNumber]);
      }
    }
    out = [...byProc.values()];
  }
  return out;
}

/**
 * Search TED. Iterates with ITERATION pagination until maxResults.
 * Returns { query, total, records }.
 */
export async function searchTenders(opts = {}, { fetchImpl, pageSize = 100 } = {}) {
  const { maxResults = 100, language = 'eng', collapseByProcedure = false } = opts;
  const query = buildQuery(opts);
  const retrievedAt = new Date().toISOString();
  const raw = [];
  let token = null;
  let total = null;
  do {
    const body = { query, fields: FIELDS, limit: Math.min(pageSize, 250, maxResults - raw.length), paginationMode: 'ITERATION' };
    if (token) body.iterationNextToken = token;
    const res = await fetchJson(TED_SEARCH_URL, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' }, fetchImpl, limiter });
    total = res.totalNoticeCount ?? total;
    raw.push(...(res.notices || []));
    token = res.iterationNextToken || null;
    if (!res.notices?.length) break;
  } while (token && raw.length < maxResults);
  const records = dedupe(raw.slice(0, maxResults).map((n) => normaliseNotice(n, { language, retrievedAt })), { collapseByProcedure });
  return { query, total, records };
}

/**
 * Alert mode: returns only notices not seen in previous runs. `state` = { seen: {pn: isoDate}, lastRunAt }.
 * Pure function over state; persistence is done by the caller (Apify KV store or MCP local file).
 */
export function filterNew(records, state = {}, { keepDays = 120, now = new Date() } = {}) {
  const seen = { ...(state.seen || {}) };
  const fresh = records.filter((r) => !seen[r.publicationNumber]);
  for (const r of records) seen[r.publicationNumber] = seen[r.publicationNumber] || now.toISOString().slice(0, 10);
  const cutoff = new Date(now.getTime() - keepDays * 864e5).toISOString().slice(0, 10);
  for (const [k, d] of Object.entries(seen)) if (d < cutoff) delete seen[k];
  return { fresh, state: { seen, lastRunAt: now.toISOString() } };
}

/** Default alert window: from last run minus 3 days overlap (TED publishes on working days), else last 7 days. */
export function alertWindow(state, now = new Date()) {
  const from = state?.lastRunAt ? new Date(new Date(state.lastRunAt).getTime() - 3 * 864e5) : new Date(now.getTime() - 7 * 864e5);
  return { publishedFrom: from.toISOString().slice(0, 10), publishedTo: now.toISOString().slice(0, 10) };
}
