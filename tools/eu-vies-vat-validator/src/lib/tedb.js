// EU VAT rates from the European Commission Taxes in Europe Database (TEDB) SOAP web service.
// Licence: CC BY 4.0 (Commission legal notice); data provided by Member States.
// No personal data. Responses are cached in memory for 12 h; requests spaced >= 1 s.
import { XMLParser } from 'fast-xml-parser';
import { attributionFor, createLimiter, sleep } from './common.js';

export const TEDB_URL = 'https://ec.europa.eu/taxation_customs/tedb/ws/';
const SOAP_ACTION = 'urn:ec.europa.eu:taxud:tedb:services:v1:VatRetrievalService/RetrieveVatRates';
const NS = 'urn:ec.europa.eu:taxud:tedb:services:v1:IVatRetrievalService';
export const MEMBER_STATES = ['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'ES', 'FI', 'FR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK'];
const ALL_CODES = [...MEMBER_STATES, 'XI'];
const CACHE_MS = 12 * 3600 * 1000;
const defaultLimiter = createLimiter(1000);
const UA = 'eu-nordic-open-data-mcp/0.2 (+https://github.com/itulo/eu-nordic-open-data-mcp)';

const xmlEsc = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

export function normaliseCountry(c) {
  const v = String(c || '').trim().toUpperCase();
  const m = { GR: 'EL', UK: 'XI' }[v] || v;
  if (!ALL_CODES.includes(m)) throw new Error(`Unknown EU member state "${c}". Use ISO alpha-2 (Greece = EL or GR; Northern Ireland = XI).`);
  return m;
}

export function isoDay(d) {
  if (!d) return new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d))) throw new Error(`Invalid date "${d}" (expected YYYY-MM-DD)`);
  return String(d);
}

export function buildRequest({ countries, date, cnCodes = [], cpaCodes = [], categories = [] }) {
  const t = (n, v) => `<urn1:${n}>${xmlEsc(v)}</urn1:${n}>`;
  return `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="${NS}" xmlns:urn1="${NS}:types"><soapenv:Header/><soapenv:Body><urn:retrieveVatRatesReqMsg>`
    + `<urn1:memberStates>${countries.map((c) => t('isoCode', c)).join('')}</urn1:memberStates>`
    + t('situationOn', date)
    + (categories.length ? `<urn1:categories>${categories.map((c) => t('identifier', c)).join('')}</urn1:categories>` : '')
    + (cnCodes.length ? `<urn1:cnCodes>${cnCodes.map((c) => t('value', c)).join('')}</urn1:cnCodes>` : '')
    + (cpaCodes.length ? `<urn1:cpaCodes>${cpaCodes.map((c) => t('value', c)).join('')}</urn1:cpaCodes>` : '')
    + '</urn:retrieveVatRatesReqMsg></soapenv:Body></soapenv:Envelope>';
}

const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, parseTagValue: false, trimValues: true,
  isArray: (name) => ['vatRateResults', 'code'].includes(name) });
const arr = (x) => (x === undefined || x === null ? [] : Array.isArray(x) ? x : [x]);

export function parseResponse(xml) {
  const doc = parser.parse(xml);
  const body = doc?.Envelope?.Body || {};
  if (body.Fault) {
    const f = body.Fault;
    const desc = f?.detail?.retrieveVatRatesFaultMsg?.error?.description;
    throw new Error(`TEDB fault: ${f.faultstring || 'unknown'}${desc ? ` - ${desc}` : ''}`);
  }
  const msg = body.retrieveVatRatesRespMsg;
  if (!msg) throw new Error('Unexpected TEDB response (no retrieveVatRatesRespMsg)');
  return arr(msg.vatRateResults).map((r) => ({
    country: r.memberState,
    rateKind: r.type, // STANDARD | REDUCED
    rateType: r.rate?.type || null, // DEFAULT, REDUCED_RATE, SUPER_REDUCED_RATE, PARKING_RATE, EXEMPTED, NOT_APPLICABLE, OUT_OF_SCOPE
    rate: r.rate?.value !== undefined && r.rate?.value !== '' ? Number(r.rate.value) : null,
    situationOn: r.situationOn ? String(r.situationOn).slice(0, 10) : null,
    category: r.category ? { id: r.category.identifier || null, description: r.category.description || null } : null,
    cnCodes: arr(r.cnCodes?.code).map((c) => ({ code: c.value, description: c.description || null })),
    cpaCodes: arr(r.cpaCodes?.code).map((c) => ({ code: c.value, description: c.description || null })),
    comment: r.comment || null,
  }));
}

/** Collapse detailed rows into a per-country summary of rate levels. */
export function summarise(rows, countries) {
  const out = [];
  for (const c of countries) {
    const rs = rows.filter((r) => r.country === c);
    const std = rs.filter((r) => r.rateKind === 'STANDARD');
    const main = std.find((r) => !r.comment) || std[0] || null;
    const lvl = (t) => [...new Set(rs.filter((r) => r.rateType === t && r.rate !== null).map((r) => r.rate))].sort((a, b) => b - a);
    out.push({
      country: c,
      standardRate: main ? main.rate : null,
      standardSince: main ? main.situationOn : null,
      reducedRates: lvl('REDUCED_RATE'),
      superReducedRates: lvl('SUPER_REDUCED_RATE'),
      parkingRates: lvl('PARKING_RATE'),
      hasExemptions: rs.some((r) => r.rateType === 'EXEMPTED'),
      regionalStandardRates: std.filter((r) => r !== main).map((r) => ({ rate: r.rate, note: r.comment })),
      categoriesWithReducedRates: [...new Set(rs.filter((r) => r.rateKind === 'REDUCED' && r.category?.id).map((r) => r.category.id))].sort(),
    });
  }
  return out;
}

export function createTedbClient({ fetchImpl = globalThis.fetch, limiter = defaultLimiter, retries = 2 } = {}) {
  const cache = new Map();
  async function post(xml) {
    for (let attempt = 0; ; attempt++) {
      let text, status;
      try {
        const res = await limiter(() => fetchImpl(TEDB_URL, {
          method: 'POST',
          headers: { 'content-type': 'text/xml; charset=utf-8', soapaction: SOAP_ACTION, 'user-agent': UA },
          body: xml,
          signal: AbortSignal.timeout(60000),
        }));
        status = res.status;
        text = await res.text();
      } catch (e) {
        if (attempt < retries) { await sleep(1000 * 2 ** attempt); continue; }
        throw e;
      }
      if (/<(\w+:)?Fault>/.test(text)) return parseResponse(text); // throws a readable fault, no retry
      if (status >= 200 && status < 300) return parseResponse(text);
      if ((status === 429 || status >= 500) && attempt < retries) { await sleep(1000 * 2 ** attempt); continue; }
      throw new Error(`TEDB HTTP ${status}: ${String(text).slice(0, 200)}`);
    }
  }

  async function retrieve({ countries, date, cnCodes = [], cpaCodes = [], categories = [] } = {}) {
    const cs = countries?.length ? [...new Set(countries.map(normaliseCountry))] : ALL_CODES.slice(0, 27);
    const day = isoDay(date);
    const norm = (a) => [...new Set((a || []).map((x) => String(x).trim()).filter(Boolean))];
    const req = { countries: cs, date: day, cnCodes: norm(cnCodes), cpaCodes: norm(cpaCodes), categories: norm(categories).map((x) => x.toUpperCase()) };
    const key = JSON.stringify(req);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return { ...req, rows: hit.rows, cached: true };
    const rows = await post(buildRequest(req));
    cache.set(key, { at: Date.now(), rows });
    return { ...req, rows, cached: false };
  }

  async function standardRates({ countries, date } = {}) {
    const r = await retrieve({ countries, date });
    return { situationOn: r.date, countries: summarise(r.rows, r.countries) };
  }

  /** Rates that apply to given CN / CPA codes or categories, most specific rows only. */
  async function lookup({ countries, date, cnCodes, cpaCodes, categories, limit = 50 } = {}) {
    if (!cnCodes?.length && !cpaCodes?.length && !categories?.length) throw new Error('Provide at least one of cnCodes, cpaCodes or categories (use eu_vat_standard_rates for headline rates).');
    const r = await retrieve({ countries, date, cnCodes, cpaCodes, categories });
    const std = summarise((await retrieve({ countries: r.countries, date: r.date })).rows, r.countries);
    const rows = r.rows.slice(0, limit).map((x) => ({ ...x, cnCodes: x.cnCodes.slice(0, 20), cpaCodes: x.cpaCodes.slice(0, 20) }));
    const matched = new Set(r.rows.map((x) => x.country));
    return {
      situationOn: r.date,
      query: { cnCodes: r.cnCodes, cpaCodes: r.cpaCodes, categories: r.categories },
      totalRows: r.rows.length,
      rows,
      fallbackToStandard: std.filter((s) => !matched.has(s.country)).map((s) => ({ country: s.country, standardRate: s.standardRate, note: 'No specific reduced/exempt entry found in TEDB for this query: the standard rate presumably applies (verify with the national tax authority).' })),
    };
  }

  return { retrieve, standardRates, lookup };
}

export function tedbAttribution() {
  return attributionFor('eu_tedb', {
    disclaimer: 'TEDB is information supplied by Member States to the European Commission; it is not legally binding. Check national legislation before relying on a rate.',
  });
}
