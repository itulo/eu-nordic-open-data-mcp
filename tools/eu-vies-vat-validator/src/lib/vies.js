// Core library for Official European Commission VIES (VAT Information Exchange System) B2B VAT validation.
// Strictly company-level only: automatically detects and redacts sole-trader / natural-person names and addresses (GDPR).
import { attributionFor, createLimiter, fetchJson } from './common.js';

export const VIES_REST_BASE = 'https://ec.europa.eu/taxation_customs/vies/rest-api';

export const VALID_VIES_PREFIXES = new Set([
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'ES',
  'FI', 'FR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT',
  'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK', 'XI',
]);

// Comprehensive regex of European corporate legal form tokens (case-insensitive word/token boundaries)
const CORPORATE_LEGAL_FORM_RE = /(?:^|[\s.,()/-])(OY|OYJ|AB|ABP|AS|ASA|APS|A\/S|GMBH|AG|KG|OHG|UG|MBH|EV|E\.V\.|SE|SCE|LTD|LIMITED|PLC|LLP|LP|INC|INCORPORATED|CORP|CORPORATION|LLC|S\.A\.|SA|S\.A\.S\.|SAS|SASU|SARL|S\.A\.R\.L\.|EURL|S\.R\.L\.|SRL|S\.R\.L\.S\.|S\.P\.A\.|SPA|S\.A\.P\.A\.|S\.N\.C\.|B\.V\.|BV|N\.V\.|NV|V\.O\.F\.|C\.V\.|SP\.\s*Z\s*O\.O\.|SPOLKA|S\.K\.A\.|S\.R\.O\.|A\.S\.|V\.O\.S\.|KFT|KFT\.|ZRT|ZRT\.|NYRT|BT|D\.O\.O\.|D\.D\.|OÜ|OU|AS|UAB|MB|VŠĮ|SIA|SHPK|EOOD|OOD|EAD|AD|S\.L\.|SL|S\.L\.U\.|S\.A\.U\.|S\.COOP|LDA|UNIPESSOAL|SGPS|EE|AE|EPE|IKE|O\.E\.|E\.E\.|OSUUSKUNTA|OSK|SÄÄTIÖ|YHDISTYS|RY|RF|KONSERNI|GROUP|HOLDING|HOLDINGS|TECHNOLOGIES|SOLUTIONS|SYSTEMS|SERVICES|PARTNERS|LOGISTICS|ENTERPRISES|INTERNATIONAL|INDUSTRIES|CONSULTING|VENTURES|CAPITAL|BANK|BANKI|PANKKI|INSURANCE|VAKUUTUS|FOUNDATION|UNIVERSITY|YLIOPISTO|AMMATTIKORKEAKOULU|MINISTRY|MUNICIPALITY|KAUPUNKI|KUNTA)(?:$|[\s.,()/-])/i;

export function viesAttribution() {
  return {
    ...attributionFor('eu_vies'),
    sourceUrl: 'https://ec.europa.eu/taxation_customs/vies/',
    legalDisclaimer: 'Validation retrieved from national EU Member State VAT databases via European Commission VIES. Company-level fields only; sole-trader personal data is redacted for GDPR compliance. Not legal or tax advice.',
  };
}

/**
 * Parse a VAT string like "FI 01120389" or "GR123456789" into { countryCode, vatNumber, fullVatNumber }.
 */
export function parseVatIdentifier(input, defaultCountryCode = '') {
  if (input && typeof input === 'object') {
    const cc = normalizeCountryCode(input.countryCode || defaultCountryCode);
    const num = String(input.vatNumber || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    const stripped = num.startsWith(cc) ? num.slice(cc.length) : num;
    return { countryCode: cc, vatNumber: stripped, fullVatNumber: `${cc}${stripped}` };
  }
  const raw = String(input || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  if (raw.length >= 3) {
    const prefix2 = normalizeCountryCode(raw.slice(0, 2));
    if (VALID_VIES_PREFIXES.has(prefix2)) {
      const body = raw.slice(2);
      return { countryCode: prefix2, vatNumber: body, fullVatNumber: `${prefix2}${body}` };
    }
  }
  const cc = normalizeCountryCode(defaultCountryCode);
  return { countryCode: cc, vatNumber: raw, fullVatNumber: `${cc}${raw}` };
}

export function normalizeCountryCode(cc) {
  const up = String(cc || '').trim().toUpperCase();
  if (up === 'GR') return 'EL'; // Greece uses EL in VIES
  return up;
}

/**
 * Determine if a returned VIES trader name represents a corporate legal entity rather than a natural person / sole trader.
 */
export function isCorporateEntityName(name) {
  const s = String(name || '').trim();
  if (!s || s === '---') return false;
  return CORPORATE_LEGAL_FORM_RE.test(s);
}

/**
 * Strip c/o lines from corporate addresses and completely redact personal names & addresses for sole traders / natural persons.
 */
export function sanitizeViesTraderData(name, address) {
  const rawName = String(name || '').trim();
  const rawAddr = String(address || '').trim();

  if (!rawName || rawName === '---') {
    return {
      companyName: null,
      companyAddress: null,
      entityClassification: 'not_disclosed_by_member_state',
      gdprRedacted: false,
    };
  }

  if (!isCorporateEntityName(rawName)) {
    return {
      companyName: '[REDACTED — non-corporate / sole trader entity (GDPR company-level only)]',
      companyAddress: '[REDACTED — GDPR company-level only]',
      entityClassification: 'sole_trader_or_natural_person_redacted',
      gdprRedacted: true,
    };
  }

  // Corporate entity: still strip any "c/o" or "attn" lines that might name a natural person
  const cleanLines = rawAddr
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && l !== '---' && !/\b(c\/o|care\s+of|attn:?|att:?)\b/i.test(l));

  return {
    companyName: rawName,
    companyAddress: cleanLines.length ? cleanLines.join(', ') : null,
    entityClassification: 'corporate_entity',
    gdprRedacted: cleanLines.length !== rawAddr.split(/\r?\n/).filter((l) => l.trim() && l.trim() !== '---').length,
  };
}

export function createViesClient({ fetchImpl = globalThis.fetch, minIntervalMs = 500 } = {}) {
  const limiter = createLimiter(minIntervalMs);

  return {
    async checkMemberStatesStatus() {
      const data = await fetchJson(`${VIES_REST_BASE}/check-status`, {
        fetchImpl,
        limiter,
        userAgent: 'open-data-tool-factory/0.1 (+eu-vies-vat-validator)',
      });
      const attr = viesAttribution();
      const vowAvailable = Boolean(data?.vow?.available);
      const countries = (data?.countries || []).map((c) => ({
        recordType: 'vies_member_state_status',
        countryCode: c.countryCode,
        availability: c.availability,
        vowSystemAvailable: vowAvailable,
        checkedAtUtc: new Date().toISOString(),
        ...attr,
      }));
      return { vowAvailable, countries };
    },

    async validateVatNumber(vatInput, { supplierCountryCode = '', requesterMemberStateCode = '', requesterNumber = '' } = {}) {
      const parsed = parseVatIdentifier(vatInput);
      const attr = viesAttribution();
      if (!VALID_VIES_PREFIXES.has(parsed.countryCode) || !parsed.vatNumber) {
        return {
          recordType: 'vies_vat_validation',
          fullVatNumber: parsed.fullVatNumber,
          countryCode: parsed.countryCode || null,
          vatNumber: parsed.vatNumber || null,
          valid: false,
          userError: 'INVALID_FORMAT_OR_COUNTRY_PREFIX',
          requestDateUtc: new Date().toISOString(),
          companyName: null,
          companyAddress: null,
          entityClassification: 'invalid_input',
          gdprRedacted: false,
          isCrossBorderEuB2B: false,
          reverseChargeCandidate: false,
          ...attr,
        };
      }

      const payload = {
        countryCode: parsed.countryCode,
        vatNumber: parsed.vatNumber,
      };
      if (requesterMemberStateCode && requesterNumber) {
        payload.requesterMemberStateCode = normalizeCountryCode(requesterMemberStateCode);
        payload.requesterNumber = String(requesterNumber).replace(/[^0-9A-Za-z]/g, '');
      }

      const res = await fetchJson(`${VIES_REST_BASE}/check-vat-number`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        fetchImpl,
        limiter,
        userAgent: 'open-data-tool-factory/0.1 (+eu-vies-vat-validator)',
      });

      const valid = Boolean(res?.valid);
      const sanitized = valid
        ? sanitizeViesTraderData(res?.name, res?.address)
        : {
            companyName: null,
            companyAddress: null,
            entityClassification: 'invalid_or_inactive_vat',
            gdprRedacted: false,
          };

      const normSupplier = normalizeCountryCode(supplierCountryCode);
      const isCrossBorderEuB2B = Boolean(valid && normSupplier && VALID_VIES_PREFIXES.has(normSupplier) && normSupplier !== parsed.countryCode);

      return {
        recordType: 'vies_vat_validation',
        fullVatNumber: `${parsed.countryCode}${parsed.vatNumber}`,
        countryCode: parsed.countryCode,
        vatNumber: parsed.vatNumber,
        valid,
        userError: res?.userError || 'VALID',
        requestDateUtc: res?.requestDate || new Date().toISOString(),
        requestIdentifier: res?.requestIdentifier || null,
        companyName: sanitized.companyName,
        companyAddress: sanitized.companyAddress,
        entityClassification: sanitized.entityClassification,
        gdprRedacted: sanitized.gdprRedacted,
        supplierCountryCode: normSupplier || null,
        isCrossBorderEuB2B,
        reverseChargeCandidate: isCrossBorderEuB2B,
        ...attr,
      };
    },

    async validateBatch(vatNumbers = [], opts = {}) {
      const results = [];
      for (const item of vatNumbers) {
        const r = await this.validateVatNumber(item, opts);
        results.push(r);
      }
      return results;
    },
  };
}
