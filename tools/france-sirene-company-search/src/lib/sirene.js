// France company search on the official API Recherche d'entreprises (DINUM), backed by the Insee
// Sirene base (Licence Ouverte 2.0). No account, no key. Company-level fields only:
//  - entreprises individuelles (nature juridique 1xxx / est_entrepreneur_individuel) are dropped,
//  - groupings without legal personality (nature juridique 2xxx, e.g. indivisions between persons) are dropped,
//  - Insee diffusion status is respected: 'P' (partial diffusion) units are kept but every field Insee masks
//    for them (exact address incl. postcode, geolocation; any '[ND]' value) is withheld; unknown statuses are dropped,
//  - marketingOptOut = RNE opposition_diffusion_commerciale (GDPR art. 21(2), C. com. R.123-320); dropped by default,
//  - dirigeants, élus, finances and establishment lists are never requested (minimal=true&include=siege,complements),
//  - head office reduced to postcode / commune / département / région (no street, no coordinates).
import { attributionFor, createLimiter, fetchJson } from './common.js';

export const BASE = 'https://recherche-entreprises.api.gouv.fr';
// API limit: 7 req/s per IP and 30 req/s per ASN (shared on cloud hosts) -> stay at 2 req/s.
const defaultLimiter = createLimiter(500);
const UA = 'france-sirene-company-search/0.1 (Apify actor by itulo; +https://github.com/itulo/eu-nordic-open-data-mcp)';
export const PER_PAGE = 25;
export const MAX_RESULTS = 10000; // API caps total_results at 10,000 (400 pages x 25)

const LEGAL_FORMS = {
  5499: 'SARL (société à responsabilité limitée)', 5498: 'EURL (SARL unipersonnelle)', 5710: 'SAS (société par actions simplifiée)',
  5720: 'SASU (SAS unipersonnelle)', 5599: 'SA à conseil d\'administration', 5699: 'SA à directoire', 5308: 'SCA',
  5202: 'SNC (société en nom collectif)', 5306: 'SCS', 6540: 'SCI (société civile immobilière)', 6599: 'Société civile',
  5560: 'SA coopérative', 5458: 'SARL coopérative', 5800: 'Société européenne', 9220: 'Association déclarée',
  9210: 'Association non déclarée', 3120: 'Société commerciale étrangère immatriculée au RCS', 7389: 'Établissement public national à caractère administratif',
  7210: 'Commune', 6220: 'GIE', 8110: 'Régime général de la sécurité sociale',
};
const HEADCOUNT = {
  NN: 'Non-employer or unknown', '00': '0 employees', '01': '1-2', '02': '3-5', '03': '6-9', 11: '10-19', 12: '20-49', 21: '50-99',
  22: '100-199', 31: '200-249', 32: '250-499', 41: '500-999', 42: '1,000-1,999', 51: '2,000-4,999', 52: '5,000-9,999', 53: '10,000+',
};

export function isValidSiren(s) {
  const v = String(s || '').replace(/\s/g, '');
  if (!/^\d{9}$/.test(v)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) { let d = Number(v[8 - i]); if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; } sum += d; }
  return sum % 10 === 0 || v === '356000000'; // La Poste is the documented Luhn exception
}

/** FR intra-community VAT number computed from the SIREN (key = (12 + 3 x (SIREN mod 97)) mod 97). Not a VIES check. */
export function frVatFromSiren(siren) {
  const n = Number(siren);
  const key = (12 + 3 * (n % 97)) % 97;
  return `FR${String(key).padStart(2, '0')}${siren}`;
}

/** Returns a reason string if the unit must be excluded under the company-level-only policy, else null. */
export function exclusionReason(r) {
  const nj = String(r?.nature_juridique || '');
  if (nj.startsWith('1') || r?.complements?.est_entrepreneur_individuel === true) return 'entrepreneur_individuel';
  if (nj.startsWith('2')) return 'grouping_without_legal_personality';
  if (r?.statut_diffusion && !['O', 'P'].includes(r.statut_diffusion)) return 'non_diffusible';
  return null;
}

export const isMarketingOptOut = (r) => r?.opposition_diffusion_commerciale === true;
export const isPartialDiffusion = (r) => r?.statut_diffusion === 'P' || r?.siege?.statut_diffusion_etablissement === 'P';
const nd = (v) => (v === '[ND]' || v === 'ND' ? null : v);

export function mapCompany(r, { retrievedAt = new Date().toISOString() } = {}) {
  const partial = isPartialDiffusion(r);
  const s = Object.fromEntries(Object.entries(r.siege || {}).map(([k, v]) => [k, nd(v)]));
  if (partial) { s.code_postal = null; s.cedex = null; } // Insee masks the exact address (postcode included) for 'P'; commune stays public
  const c = r.complements || {};
  const flags = {};
  for (const k of ['est_ess', 'est_association', 'est_service_public', 'est_administration', 'est_societe_mission', 'est_siae', 'est_qualiopi', 'est_rge', 'est_bio', 'est_organisme_formation', 'est_entrepreneur_spectacle', 'est_patrimoine_vivant']) {
    if (c[k] === true) flags[k.replace(/^est_/, '')] = true;
  }
  return {
    siren: r.siren,
    name: nd(r.nom_raison_sociale) || nd(r.nom_complet) || null,
    fullName: nd(r.nom_complet) || null,
    acronym: nd(r.sigle) || null,
    legalForm: { code: r.nature_juridique || null, label: LEGAL_FORMS[r.nature_juridique] || null },
    activity: { naf: r.activite_principale || null, naf2025: r.activite_principale_naf25 || null, section: r.section_activite_principale || null },
    companyCategory: r.categorie_entreprise || null,
    companyCategoryYear: r.annee_categorie_entreprise || null,
    headcountBand: r.tranche_effectif_salarie || null,
    headcountLabel: HEADCOUNT[r.tranche_effectif_salarie] || null,
    headcountYear: r.annee_tranche_effectif_salarie || null,
    status: r.etat_administratif === 'A' ? 'active' : r.etat_administratif === 'C' ? 'ceased' : (r.etat_administratif || null),
    creationDate: r.date_creation || null,
    closureDate: r.date_fermeture || null,
    establishments: { total: r.nombre_etablissements ?? null, open: r.nombre_etablissements_ouverts ?? null },
    headOffice: s.siret ? {
      siret: s.siret,
      naf: s.activite_principale || null,
      postCode: s.code_postal || null,
      communeCode: s.commune || null,
      city: s.libelle_commune || s.libelle_commune_etranger || null,
      departement: s.departement || null,
      region: s.region || null,
      country: s.code_pays_etranger ? (s.libelle_pays_etranger || s.code_pays_etranger) : 'FR',
      employer: s.caractere_employeur === 'O' ? true : s.caractere_employeur === 'N' ? false : null,
    } : null,
    vatNumberComputed: r.siren ? frVatFromSiren(r.siren) : null,
    collectiveAgreements: Array.isArray(c.liste_idcc) ? c.liste_idcc.filter((x) => x !== '9999') : [],
    flags,
    diffusionStatus: r.statut_diffusion || null,
    partialDiffusionMasked: partial ? ['headOffice.postCode', 'street address', 'geolocation'] : [],
    marketingOptOut: isMarketingOptOut(r),
    marketingOptOutSource: r.opposition_diffusion_commerciale === null || r.opposition_diffusion_commerciale === undefined ? 'not_in_rne' : 'rne',
    sireneUpdatedAt: r.date_mise_a_jour_insee || null,
    rneUpdatedAt: r.date_mise_a_jour_rne || null,
    annuaireUrl: `https://annuaire-entreprises.data.gouv.fr/entreprise/${r.siren}`,
    source: 'insee_sirene_via_recherche_entreprises',
    retrievedAt,
    ...attributionFor('sirene', { dataDate: r.date_mise_a_jour_insee || null }),
  };
}

const FILTER_KEYS = {
  nafCodes: 'activite_principale', section: 'section_activite_principale', postCodes: 'code_postal', communeCodes: 'code_commune',
  departements: 'departement', regions: 'region', companyCategory: 'categorie_entreprise', status: 'etat_administratif',
  legalForms: 'nature_juridique', headcountBands: 'tranche_effectif_salarie',
};
const BOOL_KEYS = { ess: 'est_ess', association: 'est_association', societeMission: 'est_societe_mission', siae: 'est_siae', qualiopi: 'est_qualiopi', rge: 'est_rge', bio: 'est_bio' };

export function buildSearchParams(input = {}, page = 1, { excludeEI = true } = {}) {
  const qs = new URLSearchParams();
  if (input.query) qs.set('q', String(input.query).slice(0, 200));
  for (const [k, p] of Object.entries(FILTER_KEYS)) {
    const v = input[k];
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) continue;
    let val = Array.isArray(v) ? v.join(',') : String(v);
    if (k === 'status') val = { active: 'A', ceased: 'C' }[val] || val;
    qs.set(p, val);
  }
  for (const [k, p] of Object.entries(BOOL_KEYS)) if (input[k] === true) qs.set(p, 'true');
  if (excludeEI) qs.set('est_entrepreneur_individuel', 'false'); // server-side pre-filter; re-checked client-side
  qs.set('minimal', 'true');
  qs.set('include', 'siege,complements');
  qs.set('per_page', String(PER_PAGE));
  qs.set('page', String(page));
  return qs;
}

export function createSireneClient({ fetchImpl, limiter = defaultLimiter } = {}) {
  const get = (qs) => fetchJson(`${BASE}/search?${qs}`, { fetchImpl, limiter, userAgent: UA, retries: 4 });

  /** Yields mapped, filtered companies. stats counts what was dropped and why. */
  async function* search(input = {}, stats = { pages: 0, seen: 0, excluded: {} }) {
    const hasFilter = input.query || Object.keys(FILTER_KEYS).some((k) => input[k] && (!Array.isArray(input[k]) || input[k].length)) || Object.keys(BOOL_KEYS).some((k) => input[k] === true);
    if (!hasFilter) throw new Error('Provide a query or at least one filter (nafCodes, postCodes, departements, regions, legalForms, ...).');
    const max = Math.min(input.maxResults ?? 100, MAX_RESULTS);
    let emitted = 0;
    for (let page = 1; emitted < max; page++) {
      const doc = await get(buildSearchParams(input, page));
      stats.pages++;
      stats.totalResults = doc?.total_results ?? stats.totalResults;
      const results = doc?.results || [];
      for (const r of results) {
        stats.seen++;
        const why = exclusionReason(r) || (input.excludeMarketingOptOut !== false && isMarketingOptOut(r) ? 'marketing_opt_out' : null);
        if (!why && isPartialDiffusion(r)) stats.partialDiffusion = (stats.partialDiffusion || 0) + 1;
        if (why) { stats.excluded[why] = (stats.excluded[why] || 0) + 1; continue; }
        yield mapCompany(r);
        if (++emitted >= max) return;
      }
      if (!results.length || page >= (doc?.total_pages || 0)) return;
    }
  }

  async function lookup(sirenList, stats = { notFound: [], invalid: [], excluded: {} }, { excludeMarketingOptOut = true } = {}) {
    const out = [];
    for (const raw of sirenList) {
      const v = String(raw).replace(/\s/g, '');
      const siren = /^\d{14}$/.test(v) ? v.slice(0, 9) : v; // accept SIRET
      if (!isValidSiren(siren)) { stats.invalid.push(raw); continue; }
      const doc = await get(buildSearchParams({ query: siren }, 1, { excludeEI: false }));
      const r = (doc?.results || []).find((x) => x.siren === siren);
      if (!r) { stats.notFound.push(siren); continue; }
      const why = exclusionReason(r) || (excludeMarketingOptOut && isMarketingOptOut(r) ? 'marketing_opt_out' : null);
      if (why) { stats.excluded[why] = (stats.excluded[why] || 0) + 1; continue; }
      if (isPartialDiffusion(r)) stats.partialDiffusion = (stats.partialDiffusion || 0) + 1;
      out.push(mapCompany(r));
    }
    return out;
  }

  return { search, lookup };
}
