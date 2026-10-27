// Core library for EU ENISA European Vulnerability Database (EUVD — euvd.enisa.europa.eu).
// Licence: ENISA Legal Notice (reproduction and reuse authorized provided the source is acknowledged).
import { attributionFor, createLimiter, fetchJson, uniq } from './common.js';

export const EUVD_API_BASE = 'https://euvdservices.enisa.europa.eu/api';

export function euvdAttribution(extra = {}) {
  return {
    ...attributionFor('enisa_euvd'),
    sourceUrl: 'https://euvd.enisa.europa.eu',
    legalDisclaimer: 'Curated vulnerability intelligence from the EU Agency for Cybersecurity (ENISA) European Vulnerability Database (EUVD) for situational awareness and NIS2 compliance support; not legal advice.',
    ...extra,
  };
}

/**
 * Normalize a raw EUVD vulnerability object into a clean flat record.
 */
export function normalizeEuvdRecord(raw) {
  const attr = euvdAttribution();
  const aliases = uniq(
    String(raw?.aliases || '')
      .split(/[\r\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean)
  );
  const cveId = aliases.find((a) => /^CVE-\d{4}-\d+/i.test(a)) || null;

  const vendors = uniq(
    (raw?.enisaIdVendor || [])
      .map((v) => v?.vendor?.name || v?.name)
      .filter(Boolean)
  );

  const products = uniq(
    (raw?.enisaIdProduct || [])
      .map((p) => {
        const name = p?.product?.name || p?.name;
        const ver = p?.product_version && p.product_version !== 'n/a' ? ` (${p.product_version})` : '';
        return name ? `${name}${ver}` : null;
      })
      .filter(Boolean)
  );

  const references = uniq(
    String(raw?.references || '')
      .split(/[\r\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)
  );

  const baseScore = raw?.baseScore !== undefined && raw?.baseScore !== null ? Number(raw.baseScore) : null;
  const epssPct = raw?.epss !== undefined && raw?.epss !== null ? Number(raw.epss) : null;
  const isExploited = Boolean(raw?.exploitedSince || raw?.exploited);

  let severityLabel = 'UNKNOWN';
  if (Number.isFinite(baseScore)) {
    if (baseScore >= 9.0) severityLabel = 'CRITICAL';
    else if (baseScore >= 7.0) severityLabel = 'HIGH';
    else if (baseScore >= 4.0) severityLabel = 'MEDIUM';
    else severityLabel = 'LOW';
  }

  return {
    recordType: 'euvd_vulnerability',
    euvdId: raw?.id || null,
    cveId,
    aliases,
    enisaUuid: raw?.enisaUuid || null,
    severityLabel,
    cvssBaseScore: Number.isFinite(baseScore) ? baseScore : null,
    cvssVersion: raw?.baseScoreVersion || null,
    cvssVector: raw?.baseScoreVector || null,
    epssScorePct: Number.isFinite(epssPct) ? epssPct : null,
    isExploited,
    exploitedSince: raw?.exploitedSince || null,
    datePublished: raw?.datePublished || null,
    dateUpdated: raw?.dateUpdated || null,
    assigner: raw?.assigner || null,
    vendors,
    products,
    description: raw?.description || null,
    references: references.slice(0, 15),
    euvdDetailUrl: raw?.id ? `https://euvd.enisa.europa.eu/vulnerability/${encodeURIComponent(raw.id)}` : 'https://euvd.enisa.europa.eu',
    ...attr,
  };
}

export function createEuvdClient({ fetchImpl = globalThis.fetch, minIntervalMs = 350 } = {}) {
  const limiter = createLimiter(minIntervalMs);

  async function getJson(pathAndQuery) {
    return fetchJson(`${EUVD_API_BASE}${pathAndQuery}`, {
      fetchImpl,
      limiter,
      userAgent: 'OpenDataFactory/1.0 (+enisa-euvd-vulnerabilities)',
    });
  }

  return {
    async fetchExploitedVulnerabilities() {
      const list = await getJson('/exploitedvulnerabilities');
      return (Array.isArray(list) ? list : []).map(normalizeEuvdRecord);
    },

    async fetchCriticalVulnerabilities() {
      const list = await getJson('/criticalvulnerabilities');
      return (Array.isArray(list) ? list : []).map(normalizeEuvdRecord);
    },

    async fetchLatestVulnerabilities() {
      const list = await getJson('/lastvulnerabilities');
      return (Array.isArray(list) ? list : []).map(normalizeEuvdRecord);
    },

    async searchVulnerabilities({
      text = '',
      vendor = '',
      product = '',
      fromScore,
      toScore,
      fromEpss,
      toEpss,
      exploited,
      fromDate = '',
      toDate = '',
      assigner = '',
      size = 20,
      page = 0,
    } = {}) {
      const params = new URLSearchParams();
      if (text) params.set('text', text);
      if (vendor) params.set('vendor', vendor);
      if (product) params.set('product', product);
      if (fromScore !== undefined && fromScore !== null) params.set('fromScore', String(fromScore));
      if (toScore !== undefined && toScore !== null) params.set('toScore', String(toScore));
      if (fromEpss !== undefined && fromEpss !== null) params.set('fromEpss', String(fromEpss));
      if (toEpss !== undefined && toEpss !== null) params.set('toEpss', String(toEpss));
      if (exploited !== undefined && exploited !== null) params.set('exploited', String(Boolean(exploited)));
      if (fromDate) params.set('fromDate', fromDate);
      if (toDate) params.set('toDate', toDate);
      if (assigner) params.set('assigner', assigner);
      params.set('size', String(Math.min(100, Math.max(1, Number(size) || 20))));
      params.set('page', String(Math.max(0, Number(page) || 0)));

      const data = await getJson(`/search?${params.toString()}`);
      const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
      return {
        total: data?.total ?? items.length,
        items: items.map(normalizeEuvdRecord),
      };
    },

    async lookupById(id) {
      const cleanId = String(id || '').trim();
      const data = await getJson(`/enisaid?id=${encodeURIComponent(cleanId)}`);
      return normalizeEuvdRecord(data);
    },
  };
}
