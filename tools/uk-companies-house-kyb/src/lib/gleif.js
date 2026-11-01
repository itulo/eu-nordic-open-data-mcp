// GLEIF LEI lookup + ownership chain (official GLEIF API, CC0 1.0).
// Personal-data rule: entity.category SOLE_PROPRIETOR records are withheld (LEI + status only).
// Mapping fields (BIC, MIC, ISIN, OpenCorporates, S&P, QCC, GEM) are never output.
import { attributionFor, createLimiter, fetchJson, HttpError } from './common.js';

export const GLEIF_BASE = 'https://api.gleif.org/api/v1';
const LEI_RE = /^[A-Z0-9]{18}[0-9]{2}$/;
// GLEIF documents 60 requests / minute / user -> keep >= 1.1 s between request starts.
const defaultLimiter = createLimiter(1100);
const UA = 'eu-nordic-open-data-mcp/0.2 (+https://github.com/itulo/eu-nordic-open-data-mcp)';

export function normaliseLei(lei) {
  const v = String(lei || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!LEI_RE.test(v)) throw new Error(`Invalid LEI "${lei}": expected 20 characters (18 alphanumerics + 2 check digits)`);
  if (!leiChecksumOk(v)) throw new Error(`Invalid LEI "${lei}": ISO 17442 check digits do not match`);
  return v;
}

/** ISO 17442 / ISO 7064 MOD 97-10 check. */
export function leiChecksumOk(lei) {
  const digits = lei.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rem = 0;
  for (const ch of digits) rem = (rem * 10 + Number(ch)) % 97;
  return rem === 1;
}

function addr(a) {
  if (!a) return null;
  return {
    addressLines: a.addressLines || [],
    city: a.city || null,
    region: a.region || null,
    country: a.country || null,
    postalCode: a.postalCode || null,
  };
}

/** Map a GLEIF lei-record to company-level output. */
export function mapRecord(rec) {
  const a = rec?.attributes || {};
  const e = a.entity || {};
  const r = a.registration || {};
  const lei = a.lei || rec?.id;
  if (e.category === 'SOLE_PROPRIETOR') {
    return {
      lei,
      withheld: true,
      reason: 'Sole proprietor (natural person) - details withheld under the company-level-only data policy.',
      category: e.category,
      entityStatus: e.status || null,
      registrationStatus: r.status || null,
      gleifUrl: `https://search.gleif.org/#/record/${lei}`,
    };
  }
  return {
    lei,
    legalName: e.legalName?.name || null,
    legalNameLanguage: e.legalName?.language || null,
    otherNames: (e.otherNames || []).map((n) => ({ name: n.name, type: n.type, language: n.language || null })),
    transliteratedNames: (e.transliteratedOtherNames || []).map((n) => ({ name: n.name, type: n.type })),
    legalForm: e.legalForm ? { code: e.legalForm.id || null, other: e.legalForm.other || null } : null,
    jurisdiction: e.jurisdiction || null,
    category: e.category || null,
    subCategory: e.subCategory || null,
    entityStatus: e.status || null,
    creationDate: e.creationDate || null,
    registeredAt: e.registeredAt?.id || null,
    registeredAs: e.registeredAs || null,
    legalAddress: addr(e.legalAddress),
    headquartersAddress: addr(e.headquartersAddress),
    successorEntities: (e.successorEntities || []).map((s) => ({ lei: s.lei || null, name: s.name || null })),
    expiration: e.expiration?.date || e.expiration?.reason ? { date: e.expiration.date || null, reason: e.expiration.reason || null } : null,
    registration: {
      status: r.status || null,
      initialRegistrationDate: r.initialRegistrationDate || null,
      lastUpdateDate: r.lastUpdateDate || null,
      nextRenewalDate: r.nextRenewalDate || null,
      managingLou: r.managingLou || null,
      corroborationLevel: r.corroborationLevel || null,
    },
    conformityFlag: a.conformityFlag || null,
    gleifUrl: `https://search.gleif.org/#/record/${lei}`,
  };
}

function mapException(rec, level) {
  const a = rec?.attributes || {};
  return {
    level,
    reportingException: true,
    reason: a.reason || null,
    category: a.category || null,
    explanation: {
      NO_KNOWN_PERSON: 'No known parent legal entity (e.g. controlled by natural persons, not reported for privacy).',
      NATURAL_PERSONS: 'Controlled by natural person(s) - not disclosed.',
      NON_CONSOLIDATING: 'The parent does not consolidate this entity under accounting rules.',
      NON_PUBLIC: 'Parent information is not public (legal obstacle or detriment).',
      NO_LEI: 'The parent has no LEI.',
      BINDING_LEGAL_COMMITMENTS: 'Disclosure prevented by binding legal commitments.',
      LEGAL_OBSTACLES: 'Disclosure prevented by legal obstacles.',
      DISCLOSURE_DETRIMENTAL: 'Disclosure would be detrimental to the entity or parent.',
      DETRIMENT_NOT_EXCLUDED: 'Detriment cannot be excluded.',
      CONSENT_NOT_OBTAINED: 'Parent did not consent to disclosure.',
    }[a.reason] || null,
  };
}

function mapRelationship(rel) {
  const a = rel?.attributes?.relationship || {};
  const reg = rel?.attributes?.registration || {};
  return {
    parentLei: a.endNode?.id || null,
    relationshipType: a.type || null,
    relationshipStatus: a.status || null,
    periods: (a.periods || []).map((p) => ({ type: p.type, startDate: p.startDate || null, endDate: p.endDate || null })),
    qualifiers: (a.qualifiers || []).map((q) => ({ dimension: q.dimension, category: q.category })),
    quantifiers: (a.quantifiers || []).map((q) => ({ method: q.measurementMethod, amount: q.quantifierAmount, units: q.quantifierUnits })),
    validationSources: reg.validationSources || null,
    corroborationLevel: reg.corroborationLevel || null,
  };
}

export function createGleifClient({ fetchImpl, limiter = defaultLimiter } = {}) {
  const get = (p) => fetchJson(`${GLEIF_BASE}${p}`, { fetchImpl, limiter, userAgent: UA, headers: { accept: 'application/vnd.api+json' } });
  const getOrNull = async (p) => {
    try { return await get(p); } catch (e) { if (e instanceof HttpError && e.status === 404) return null; throw e; }
  };

  async function lookup(leiIn) {
    const lei = normaliseLei(leiIn);
    const doc = await getOrNull(`/lei-records/${lei}`);
    if (!doc?.data) return { lei, found: false };
    return { found: true, ...mapRecord(doc.data) };
  }

  async function lookupMany(leis) {
    const list = [...new Set(leis.map(normaliseLei))];
    const out = [];
    for (let i = 0; i < list.length; i += 100) {
      const chunk = list.slice(i, i + 100);
      const doc = await get(`/lei-records?filter[lei]=${chunk.join(',')}&page[size]=100`);
      const byLei = new Map((doc?.data || []).map((d) => [d.attributes?.lei || d.id, d]));
      for (const l of chunk) out.push(byLei.has(l) ? { found: true, ...mapRecord(byLei.get(l)) } : { lei: l, found: false });
    }
    return out;
  }

  async function search({ name, registeredAs, country, status, limit = 10 } = {}) {
    if (!name && !registeredAs) throw new Error('Provide name or registeredAs (national register number)');
    const qs = new URLSearchParams();
    if (name) qs.set('filter[entity.names]', name);
    if (registeredAs) qs.set('filter[entity.registeredAs]', registeredAs);
    if (country) qs.set('filter[entity.legalAddress.country]', String(country).toUpperCase());
    if (status) qs.set('filter[entity.status]', String(status).toUpperCase());
    qs.set('page[size]', String(Math.min(Math.max(1, limit), 50)));
    const doc = await get(`/lei-records?${qs.toString().replace(/%5B/g, '[').replace(/%5D/g, ']')}`);
    const results = (doc?.data || []).map(mapRecord);
    return { total: doc?.meta?.pagination?.total ?? results.length, count: results.length, results };
  }

  async function parentLevel(lei, level) {
    const seg = level === 'direct' ? 'direct-parent' : 'ultimate-parent';
    const rel = await getOrNull(`/lei-records/${lei}/${seg}-relationship`);
    if (rel?.data) return { level, reportingException: false, ...mapRelationship(rel.data) };
    const exc = await getOrNull(`/lei-records/${lei}/${seg}-reporting-exception`);
    if (exc?.data) return mapException(exc.data, level);
    return { level, reportingException: false, parentLei: null, note: 'No parent relationship or reporting exception on file (Level 2 data not yet reported).' };
  }

  async function ownership(leiIn, { includeChildrenCount = true } = {}) {
    const lei = normaliseLei(leiIn);
    const self = await lookup(lei);
    if (!self.found) return { lei, found: false };
    if (self.withheld) return { lei, found: true, entity: self, directParent: null, ultimateParent: null };
    const direct = await parentLevel(lei, 'direct');
    const ultimate = await parentLevel(lei, 'ultimate');
    const parentLeis = [direct.parentLei, ultimate.parentLei].filter(Boolean);
    if (parentLeis.length) {
      const parents = await lookupMany(parentLeis);
      const by = new Map(parents.map((p) => [p.lei, p]));
      if (direct.parentLei) direct.parent = by.get(direct.parentLei) || null;
      if (ultimate.parentLei) ultimate.parent = by.get(ultimate.parentLei) || null;
    }
    let directChildren = null;
    if (includeChildrenCount) {
      const ch = await getOrNull(`/lei-records/${lei}/direct-children?page[size]=1`);
      directChildren = ch?.meta?.pagination?.total ?? 0;
    }
    return { lei, found: true, entity: self, directParent: direct, ultimateParent: ultimate, directChildrenCount: directChildren };
  }

  return { lookup, lookupMany, search, ownership };
}

export function gleifAttribution() {
  return attributionFor('gleif', {
    personalDataPolicy: 'Company-level only: sole-proprietor (natural person) LEI records are withheld; no BIC/ISIN/third-party mapping fields.',
    rateLimit: 'GLEIF API: 60 requests/minute/user; this tool spaces requests >= 1.1 s.',
  });
}
