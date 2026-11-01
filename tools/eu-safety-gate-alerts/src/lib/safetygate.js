// EU Safety Gate (RAPEX) dangerous non-food product alerts from the official weekly-report XML
// (data.europa.eu distribution licensed CC0 1.0). No personal data: product-level fields only;
// online-marketplace seller text is reduced to platform names and listing ids (ASIN etc.).
import { XMLParser } from 'fast-xml-parser';
import { attributionFor, createLimiter, sleep } from './common.js';

export const LIST_URL = 'https://ec.europa.eu/safety-gate-alerts/api/download/weeklyReport/list/xml/en';
const LIST_CACHE_MS = 6 * 3600 * 1000;
const defaultLimiter = createLimiter(1000);
const UA = 'eu-nordic-open-data-mcp/0.2 (+https://github.com/itulo/eu-nordic-open-data-mcp)';

const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: true, cdataPropName: false,
  isArray: (name) => ['weeklyReport', 'notifications', 'picture'].includes(name) });
const txt = (v) => {
  if (v === undefined || v === null) return null;
  if (typeof v === 'object') return null; // xsi:nil or empty element
  const s = String(v).replace(/\s+/g, ' ').trim();
  return s || null;
};
const dmyToIso = (s) => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s || '').trim());
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
};

export function parseList(xml) {
  const doc = parser.parse(xml);
  return (doc?.['Safety-Gate']?.weeklyReport || []).map((w) => ({
    reference: txt(w.reference),
    publicationDate: dmyToIso(w.publicationDate),
    year: Number(w.year) || null,
    week: Number(w.week) || null,
    url: txt(w.URL),
  })).filter((w) => w.url).sort((a, b) => String(b.publicationDate).localeCompare(String(a.publicationDate)));
}

/** Split a raw barcode field into normalised GTIN-like codes (handles codes jammed together). */
export function splitBarcodes(raw) {
  const out = new Set();
  for (const run of String(raw || '').match(/\d{8,}/g) || []) {
    if (run.length <= 14) out.add(run);
    else for (const n of [13, 12, 14, 8]) {
      if (run.length % n === 0) { for (let i = 0; i < run.length; i += n) out.add(run.slice(i, i + n)); break; }
    }
  }
  return [...out];
}

export function normGtin(g) {
  const d = String(g || '').replace(/\D/g, '');
  return d ? d.replace(/^0+(?=\d{8})/, '') : '';
}

function parseMeasures(raw) {
  const s = txt(raw);
  if (!s) return [];
  return s.split(/Type of economic operator taking notified measure\(s\):\s*/).filter(Boolean).map((p) => {
    const m = /^(.*?)Category of measure\(s\):\s*(.*?)(?:Date of entry into force:\s*(\d{1,2}\/\d{1,2}\/\d{4}))?\s*$/.exec(p.trim());
    return m ? { economicOperator: m[1].trim() || null, measure: m[2].trim() || null, effectiveDate: dmyToIso(m[3]) } : { measure: p.trim() };
  });
}

function parseOnline(raw) {
  const s = txt(raw);
  if (!s) return { platforms: [], listingIds: [] };
  const platforms = [...new Set([...s.matchAll(/(?:^|\/)\s*([A-Za-z][\w .&-]{1,40}?)\s*\(/g)].map((m) => m[1].trim()))];
  const listingIds = [...new Set([...(s.match(/\bB0[A-Z0-9]{8}\b/g) || []), ...(s.match(/\b\d{10,}\b/g) || []), ...(s.match(/\bsr\d{10,}\b/g) || [])])];
  return { platforms, listingIds };
}

export function parseReport(xml, meta = {}) {
  const sg = parser.parse(xml)?.['Safety-Gate'] || {};
  const reportDate = dmyToIso(sg.report_date) || meta.publicationDate || null;
  return (sg.notifications || []).map((n) => {
    const online = parseOnline(n.onlineTrader);
    const ref = txt(n.reference);
    return {
      caseNumber: txt(n.caseNumber),
      alertUrl: ref,
      alertId: ref ? (/(\d+)\s*$/.exec(ref) || [])[1] || null : null,
      reportReference: meta.reference || (sg.report_year && sg.report_week ? `Report-${sg.report_year}-${sg.report_week}` : null),
      reportDate,
      category: txt(n.category),
      product: txt(n.product),
      brand: txt(n.brand),
      name: txt(n.name),
      model: txt(n.type_numberOfModel),
      batchNumber: txt(n.batchNumber),
      barcodes: splitBarcodes(txt(n.barcode)),
      barcodeRaw: txt(n.barcode),
      riskType: txt(n.riskType) ? txt(n.riskType).split(/\s*,\s*/) : [],
      riskLevel: txt(n.level),
      danger: txt(n.danger),
      measures: parseMeasures(n.measures),
      recallUrl: txt(n.URLrecall),
      companyRecallCode: txt(n.companyRecallCode),
      productionDates: txt(n.productionDates),
      description: txt(n.description),
      notifyingCountry: txt(n.notifyingCountry),
      countryOfOrigin: txt(n.countryOfOrigin),
      userType: txt(n.type),
      onlinePlatforms: online.platforms,
      onlineListingIds: online.listingIds,
      pictureUrls: (n.pictures?.picture || []).map(txt).filter(Boolean),
    };
  });
}

const fold = (s) => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const compact = (s) => fold(s).replace(/ /g, '');

export function filterAlerts(alerts, { notifyingCountry, countryOfOrigin, category, riskType, riskLevel, query, fromDate } = {}) {
  const has = (field, needle) => !needle || fold(field).includes(fold(needle));
  return alerts.filter((a) => has(a.notifyingCountry, notifyingCountry)
    && has(a.countryOfOrigin, countryOfOrigin)
    && has(`${a.category} ${a.product}`, category)
    && (!riskType || a.riskType.some((r) => fold(r).includes(fold(riskType))))
    && has(a.riskLevel, riskLevel)
    && (!fromDate || String(a.reportDate) >= fromDate)
    && (!query || fold([a.product, a.brand, a.name, a.model, a.description, a.category].join(' ')).includes(fold(query))));
}

/** Match a catalogue of products against alerts. Returns only products with at least one match. */
export function matchProducts(alerts, products) {
  const byGtin = new Map();
  for (const a of alerts) for (const b of a.barcodes) {
    const k = normGtin(b);
    if (!byGtin.has(k)) byGtin.set(k, []);
    byGtin.get(k).push(a);
  }
  const results = [];
  products.forEach((p, i) => {
    const matches = new Map();
    const add = (a, type, score) => { const prev = matches.get(a.caseNumber); if (!prev || prev.score < score) matches.set(a.caseNumber, { matchType: type, score, alert: a }); };
    for (const g of [].concat(p.gtin || [])) for (const a of byGtin.get(normGtin(g)) || []) add(a, 'gtin', 1);
    for (const id of [].concat(p.listingId || [])) for (const a of alerts) if (a.onlineListingIds.includes(String(id).trim())) add(a, 'listing_id', 0.95);
    const brand = compact(p.brand);
    const model = compact(p.model);
    if (brand && brand.length >= 2) {
      for (const a of alerts) {
        if (compact(a.brand) !== brand) continue;
        const am = compact(a.model);
        if (model && am && (am === model || (model.length >= 4 && (am.includes(model) || model.includes(am))))) add(a, 'brand_model', 0.85);
        else if (!model && p.name && fold(a.name || a.product).includes(fold(p.name))) add(a, 'brand_name', 0.6);
        else if (!model && !p.name) add(a, 'brand_only', 0.3);
      }
    }
    if (matches.size) results.push({ index: i, input: p, matches: [...matches.values()].sort((x, y) => y.score - x.score) });
  });
  return results;
}

export function createSafetyGateClient({ fetchImpl = globalThis.fetch, limiter = defaultLimiter, retries = 2 } = {}) {
  let listCache = null;
  const reportCache = new Map();
  async function getText(url) {
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await limiter(() => fetchImpl(url, { headers: { accept: 'application/xml', 'user-agent': UA }, signal: AbortSignal.timeout(60000) }));
        const text = await res.text();
        if (res.ok) return text;
        if ((res.status === 429 || res.status >= 500) && attempt < retries) { await sleep(1000 * 2 ** attempt); continue; }
        throw new Error(`Safety Gate HTTP ${res.status} for ${url}`);
      } catch (e) {
        if (attempt < retries && !/Safety Gate HTTP/.test(e.message)) { await sleep(1000 * 2 ** attempt); continue; }
        throw e;
      }
    }
  }
  async function reports(limit = 10) {
    if (!listCache || Date.now() - listCache.at > LIST_CACHE_MS) listCache = { at: Date.now(), list: parseList(await getText(LIST_URL)) };
    return listCache.list.slice(0, limit);
  }
  async function alertsForWeeks(weeks = 1) {
    const list = await reports(weeks);
    const all = [];
    for (const r of list) {
      if (!reportCache.has(r.url)) reportCache.set(r.url, parseReport(await getText(r.url), r)); // published reports are immutable
      all.push(...reportCache.get(r.url));
    }
    return { reports: list, alerts: all };
  }
  async function alerts({ weeks = 1, limit = 50, ...filters } = {}) {
    const { reports: rs, alerts: all } = await alertsForWeeks(weeks);
    const hits = filterAlerts(all, filters);
    return { reportsScanned: rs.map((r) => r.reference), alertsScanned: all.length, matched: hits.length, alerts: hits.slice(0, limit) };
  }
  async function match({ products, weeks = 8 } = {}) {
    if (!products?.length) throw new Error('products must be a non-empty array of {gtin?, brand?, model?, name?, listingId?}');
    const { reports: rs, alerts: all } = await alertsForWeeks(weeks);
    const res = matchProducts(all, products);
    return { reportsScanned: rs.map((r) => r.reference), coverage: rs.length ? { from: rs[rs.length - 1].publicationDate, to: rs[0].publicationDate } : null, alertsScanned: all.length, productsChecked: products.length, productsMatched: res.length, results: res };
  }
  return { reports, alerts, match };
}

export function safetyGateAttribution() {
  return attributionFor('safety_gate', {
    disclaimer: 'Informational only, not legal advice. A match is a signal to review the official alert; brand/model matches can be false positives. Product photos are linked, not re-hosted.',
  });
}
