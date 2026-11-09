// Core library for EU Consolidated Financial Sanctions List (DG FISMA / FSF) screening.
// Shared by the Apify actor (src/main.js) and the stdio MCP server (src/mcp-server.js).
//
// Licence & compliance rules (verified in /workspace/open-data-factory/licences.json):
//   - Commission Decision 2011/833/EU on the reuse of Commission documents
//   - Every record & response MUST include:
//       1) Source attribution (from licences.json `eu_sanctions`) with fileGenerationDate
//       2) List publication/generation date (`listPublicationDate` & `fileGenerationDate`)
//       3) Explicit "not legal advice" disclaimer (`disclaimer`)
//   - Non-distortion rule (Decision 2011/833/EU Art. 6(2)):
//       Fuzzy / non-exact similarity matches MUST be clearly labeled `"possible match"`,
//       never presented as determinations. Only the Official Journal is legally binding.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { attributionFor } from './common.js';

export const FSF_CSV_1_1_URL =
  'https://webgate.ec.europa.eu/fsd/fsf/public/files/csvFullSanctionsList_1_1/content?token=dG9rZW4tMjAxNw';

export const NOT_LEGAL_ADVICE_DISCLAIMER =
  'Not legal advice. Screening results are informational aids only and do not constitute a legal determination of sanctions status. Only the regulations published in the Official Journal of the European Union are legally binding.';

export const POSSIBLE_MATCH_LABEL =
  'possible match (fuzzy similarity — manual review against the Official Journal required; not a determination)';

export const POSSIBLE_MATCH_WARNING =
  'Possible match only (score < 1.00). Under Commission Decision 2011/833/EU non-distortion rules, fuzzy similarity scores are indicators for human review, never determinations.';

export function normalizeGenerationDate(raw) {
  if (!raw) return 'unknown';
  const s = String(raw).trim();
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return s;
}

export function sanctionsAttribution(fileGenerationDate = 'unknown') {
  const block = attributionFor('eu_sanctions');
  return String(block.attribution || '').replace('<fileGenerationDate>', fileGenerationDate || 'unknown');
}

export function complianceEnvelope(fileGenerationDate = 'unknown') {
  const listPublicationDate = normalizeGenerationDate(fileGenerationDate);
  return {
    fileGenerationDate: fileGenerationDate || 'unknown',
    listPublicationDate,
    disclaimer: NOT_LEGAL_ADVICE_DISCLAIMER,
    attribution: sanctionsAttribution(fileGenerationDate || 'unknown'),
  };
}

// Fast semicolon CSV line splitter supporting double-quoted fields.
export function splitSemicolonLine(line) {
  if (!line.includes('"')) return line.split(';');
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ';' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

// Normalize person/entity names for comparison (strip diacritics, punctuation, collapse whitespace).
export function normalizeName(str) {
  if (!str) return '';
  return String(str)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\u0400-\u04ff\u0600-\u06ff]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizeId(str) {
  if (!str) return '';
  return String(str).trim().toUpperCase().replace(/[\s-]+/g, '');
}

// Jaro-Winkler similarity in [0, 1]
export function jaroWinkler(a, b) {
  if (a === b) return 1.0;
  if (!a || !b) return 0.0;
  const lenA = a.length;
  const lenB = b.length;
  const matchDist = Math.max(0, Math.floor(Math.max(lenA, lenB) / 2) - 1);
  const aMatches = new Array(lenA).fill(false);
  const bMatches = new Array(lenB).fill(false);
  let matches = 0;
  for (let i = 0; i < lenA; i++) {
    const start = Math.max(0, i - matchDist);
    const end = Math.min(i + matchDist + 1, lenB);
    for (let j = start; j < end; j++) {
      if (bMatches[j] || a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0.0;
  let t = 0;
  let k = 0;
  for (let i = 0; i < lenA; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  const jaro = (matches / lenA + matches / lenB + (matches - t / 2) / matches) / 3;
  let prefix = 0;
  for (let i = 0; i < Math.min(4, lenA, lenB); i++) {
    if (a[i] === b[i]) prefix++;
    else break;
  }
  return jaro + prefix * 0.1 * (1 - jaro);
}

// Order-independent token similarity + Jaro-Winkler composite score in [0, 1].
// Returns 1.0 ONLY when normalized strings are identical.
export function nameSimilarity(queryNorm, candidateNorm, queryTokens, candidateTokens) {
  if (!queryNorm || !candidateNorm) return 0;
  if (queryNorm === candidateNorm) return 1.0;

  const jwDirect = jaroWinkler(queryNorm, candidateNorm);

  // Also compare sorted tokens to handle "LastName FirstName" vs "FirstName LastName"
  const qToks = queryTokens || queryNorm.split(' ').filter(Boolean);
  const cToks = candidateTokens || candidateNorm.split(' ').filter(Boolean);
  const qSorted = [...qToks].sort().join(' ');
  const cSorted = [...cToks].sort().join(' ');
  const jwSorted = qSorted === cSorted ? 0.97 : jaroWinkler(qSorted, cSorted) * 0.96;

  // Token-level best bipartite average (handles middle names / patronymics)
  let tokenScore = 0;
  if (qToks.length && cToks.length) {
    let sum = 0;
    for (const qt of qToks) {
      let best = 0;
      for (const ct of cToks) {
        const s = qt === ct ? 1.0 : jaroWinkler(qt, ct);
        if (s > best) best = s;
      }
      sum += best;
    }
    const coveragePenalty = Math.min(1, Math.sqrt(Math.min(qToks.length, cToks.length) / Math.max(qToks.length, cToks.length)));
    tokenScore = (sum / qToks.length) * (0.85 + 0.13 * coveragePenalty);
  }

  const best = Math.max(jwDirect, jwSorted, tokenScore);
  // Cap any non-identical string below 1.0 so only true exact matches get 1.0
  return Math.min(0.99, Number(best.toFixed(4)));
}

export function parseSanctionsCsv(csvText) {
  const lines = String(csvText || '').split(/\r?\n/);
  if (!lines.length || !lines[0].trim()) {
    throw new Error('Empty EU Sanctions CSV payload');
  }
  const headerLine = lines[0].replace(/^\uFEFF/, '');
  const cols = splitSemicolonLine(headerLine);
  const idx = Object.fromEntries(cols.map((c, i) => [c.trim(), i]));
  if (idx.Entity_LogicalId === undefined || idx.fileGenerationDate === undefined) {
    throw new Error(`Unexpected EU Sanctions CSV header: missing Entity_LogicalId or fileGenerationDate`);
  }

  let fileGenerationDate = null;
  const byLogicalId = new Map();
  const programmes = new Set();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    const row = splitSemicolonLine(line);
    const get = (col) => {
      const k = idx[col];
      return k !== undefined && row[k] !== undefined ? row[k].trim() : '';
    };

    const genDate = get('fileGenerationDate');
    if (genDate && !fileGenerationDate) fileGenerationDate = genDate;

    const logicalId = get('Entity_LogicalId');
    if (!logicalId) continue;

    let ent = byLogicalId.get(logicalId);
    if (!ent) {
      const subjectClassification = (get('Entity_SubjectType_ClassificationCode') || '').toLowerCase();
      const subjectCode = get('Entity_SubjectType');
      const subjectType = subjectClassification || (subjectCode === 'P' ? 'person' : subjectCode === 'E' ? 'enterprise' : 'unknown');
      const programme = get('Entity_Regulation_Programme') || get('NameAlias_Regulation_Programme') || '';
      if (programme) programmes.add(programme);

      ent = {
        logicalId,
        euReferenceNumber: get('Entity_EU_ReferenceNumber') || null,
        unitedNationId: get('Entity_UnitedNationId') || null,
        subjectCode: subjectCode || null,
        subjectType,
        programme: programme || null,
        regulationNumberTitle: get('Entity_Regulation_NumberTitle') || null,
        regulationPublicationDate: get('Entity_Regulation_PublicationDate') || null,
        regulationEntryIntoForceDate: get('Entity_Regulation_EntryIntoForceDate') || null,
        regulationPublicationUrl: get('Entity_Regulation_PublicationUrl') || null,
        designationDate: get('Entity_DesignationDate') || null,
        designationDetails: get('Entity_DesignationDetails') || null,
        remark: get('Entity_Remark') || null,
        primaryName: null,
        names: [],
        _nameSet: new Set(),
        birthDates: [],
        _birthSet: new Set(),
        citizenships: [],
        _citSet: new Set(),
        countries: [],
        _countrySet: new Set(),
        addresses: [],
        _addrSet: new Set(),
        identifications: [],
        _idSet: new Set(),
      };
      byLogicalId.set(logicalId, ent);
    }

    const addCountry = (c) => {
      const code = (c || '').toUpperCase().trim();
      if (code && code.length === 2 && code !== '00' && !ent._countrySet.has(code)) {
        ent._countrySet.add(code);
        ent.countries.push(code);
      }
    };

    // NameAlias
    const wholeName =
      get('NameAlias_WholeName') ||
      [get('NameAlias_FirstName'), get('NameAlias_MiddleName'), get('NameAlias_LastName')].filter(Boolean).join(' ').trim();
    if (wholeName) {
      const norm = normalizeName(wholeName);
      if (norm && !ent._nameSet.has(norm)) {
        ent._nameSet.add(norm);
        const nameEntry = {
          wholeName,
          firstName: get('NameAlias_FirstName') || null,
          lastName: get('NameAlias_LastName') || null,
          language: get('NameAlias_NameLanguage') || null,
          gender: get('NameAlias_Gender') || null,
          title: get('NameAlias_Title') || null,
          function: get('NameAlias_Function') || null,
          norm,
          tokens: norm.split(' ').filter(Boolean),
        };
        ent.names.push(nameEntry);
        if (!ent.primaryName) ent.primaryName = wholeName;
      }
    }

    // BirthDate
    const bDate = get('BirthDate_BirthDate');
    const bYear = get('BirthDate_Year') || (bDate ? bDate.slice(0, 4) : '');
    const bCountry = get('BirthDate_CountryIso2Code');
    if (bCountry) addCountry(bCountry);
    if (bDate || bYear) {
      const key = `${bDate}|${bYear}|${get('BirthDate_City')}|${bCountry}`;
      if (!ent._birthSet.has(key)) {
        ent._birthSet.add(key);
        ent.birthDates.push({
          birthDate: bDate || null,
          year: bYear || null,
          city: get('BirthDate_City') || get('BirthDate_Place') || null,
          countryIso2: bCountry || null,
        });
      }
    }

    // Citizenship
    const citCountry = get('Citizenship_CountryIso2Code');
    if (citCountry) {
      addCountry(citCountry);
      if (!ent._citSet.has(citCountry)) {
        ent._citSet.add(citCountry);
        ent.citizenships.push(citCountry);
      }
    }

    // Address
    const addrCountry = get('Address_CountryIso2Code');
    const addrCity = get('Address_City') || get('Address_Place');
    if (addrCountry) addCountry(addrCountry);
    if (addrCountry || addrCity) {
      const key = `${addrCountry}|${addrCity}`;
      if (!ent._addrSet.has(key)) {
        ent._addrSet.add(key);
        ent.addresses.push({
          city: addrCity || null,
          countryIso2: addrCountry || null,
          countryDescription: get('Address_CountryDescription') || null,
        });
      }
    }

    // Identification
    const idNum = get('Identification_Number') || get('Identification_LatinNumber');
    const idCountry = get('Identification_CountryIso2Code');
    if (idCountry) addCountry(idCountry);
    if (idNum) {
      const idNorm = normalizeId(idNum);
      if (idNorm && !ent._idSet.has(idNorm)) {
        ent._idSet.add(idNorm);
        ent.identifications.push({
          number: idNum,
          norm: idNorm,
          typeCode: get('Identification_TypeCode') || null,
          typeDescription: get('Identification_TypeDescription') || null,
          countryIso2: idCountry || null,
        });
      }
    }
  }

  const entities = [];
  for (const ent of byLogicalId.values()) {
    delete ent._nameSet;
    delete ent._birthSet;
    delete ent._citSet;
    delete ent._countrySet;
    delete ent._addrSet;
    delete ent._idSet;
    entities.push(ent);
  }

  const env = complianceEnvelope(fileGenerationDate || 'unknown');
  return {
    ...env,
    totalEntities: entities.length,
    programmes: [...programmes].sort(),
    entities,
  };
}

// ---------------------------------------------------------------------------
// Download, validation and persistent last-good cache
// ---------------------------------------------------------------------------
// The official FSF download has had multi-day outages (HTTP 500, or a 307 redirect to
// sorry.ec.europa.eu that answers 200 HTML). We therefore:
//   1. fetch with a cookie-keeping, manual-redirect client and bounded retries;
//   2. validate every payload (not HTML, expected CSV header, plausible entity count)
//      BEFORE using or caching it; maintenance pages are never parsed or cached;
//   3. keep a persistent "last good" copy (gzipped CSV + metadata) in a cache store
//      (Apify named key-value store in the actor, a tmp-dir file store for the MCP server);
//   4. on upstream failure, serve the cached copy marked listStatus "stale".

export const CACHE_DATA_KEY = 'EU_FSF_CSV_1_1_GZ';
export const CACHE_META_KEY = 'EU_FSF_CSV_1_1_META';
export const DEFAULT_MIN_ENTITIES = 3000; // fixed sanity floor when no cache exists (list had 6,269 on 23/10/2026)
export const MIN_ENTITY_RATIO = 0.7; // a fresh file must have >= 70% of the cached entity count
const USER_AGENT = 'open-data-factory-eu-sanctions-screen/0.2 (+https://data.europa.eu)';

export class SanctionsListError extends Error {
  constructor(message, { kind = 'error', status = null } = {}) {
    super(message);
    this.name = 'SanctionsListError';
    this.kind = kind;
    this.status = status;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getSetCookies(headers) {
  if (!headers) return [];
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  const raw = typeof headers.get === 'function' ? headers.get('set-cookie') : null;
  return raw ? raw.split(/,(?=\s*[^;,=\s]+=)/) : [];
}

// Single download attempt: keeps cookies across redirects (EU Login / ECAS style hops)
// and refuses to follow into the sorry.ec.europa.eu maintenance page.
export async function fetchWithCookies(url, { fetchImpl = globalThis.fetch, maxRedirects = 6, timeoutMs = 120000 } = {}) {
  const jar = new Map();
  let current = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const host = new URL(current).hostname;
    if (/^sorry\./i.test(host) || /sorry\.ec\.europa\.eu/i.test(current)) {
      throw new SanctionsListError(`EU FSF download redirected to maintenance page (${host}); upstream temporarily unavailable`, { kind: 'maintenance' });
    }
    const cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    let res;
    try {
      res = await fetchImpl(current, {
        redirect: 'manual',
        signal: ctrl?.signal,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/csv, text/plain;q=0.9, */*;q=0.1',
          ...(cookie ? { Cookie: cookie } : {}),
        },
      });
    } catch (e) {
      throw new SanctionsListError(`EU FSF download network error: ${e?.name === 'AbortError' ? `timeout after ${timeoutMs} ms` : e?.message || e}`, { kind: 'network' });
    } finally {
      if (timer) clearTimeout(timer);
    }
    for (const sc of getSetCookies(res.headers)) {
      const m = /^\s*([^=;\s]+)=([^;]*)/.exec(sc);
      if (m) jar.set(m[1], m[2]);
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers?.get?.('location');
      if (!loc) throw new SanctionsListError(`EU FSF download: HTTP ${res.status} redirect without Location`, { kind: 'http', status: res.status });
      current = new URL(loc, current).toString();
      continue;
    }
    if (!res.ok) {
      throw new SanctionsListError(`EU FSF CSV download failed: HTTP ${res.status}`, { kind: 'http', status: res.status });
    }
    const contentType = res.headers?.get?.('content-type') || '';
    const text = await res.text();
    return { text, contentType, finalUrl: current, status: res.status };
  }
  throw new SanctionsListError(`EU FSF download: too many redirects (>${maxRedirects})`, { kind: 'http' });
}

// Validate a downloaded payload; returns the parsed index or throws SanctionsListError.
export function validateSanctionsPayload({ text, contentType = '' }, { minEntities = DEFAULT_MIN_ENTITIES } = {}) {
  const ct = String(contentType || '').toLowerCase();
  const head = String(text || '').slice(0, 512).replace(/^\uFEFF/, '').trimStart().toLowerCase();
  if (ct.includes('html') || head.startsWith('<!doctype') || head.startsWith('<html') || head.startsWith('<?xml') || head.startsWith('<')) {
    throw new SanctionsListError(`EU FSF download returned HTML/markup instead of CSV (content-type "${contentType || 'none'}"); probably a maintenance page`, { kind: 'invalid' });
  }
  let index;
  try {
    index = parseSanctionsCsv(text);
  } catch (e) {
    throw new SanctionsListError(`EU FSF CSV failed validation: ${e.message}`, { kind: 'invalid' });
  }
  if (!index.fileGenerationDate || index.fileGenerationDate === 'unknown') {
    throw new SanctionsListError('EU FSF CSV failed validation: no fileGenerationDate in rows', { kind: 'invalid' });
  }
  if (index.totalEntities < minEntities) {
    throw new SanctionsListError(`EU FSF CSV failed validation: implausibly small list (${index.totalEntities} entities < sanity floor ${minEntities})`, { kind: 'invalid' });
  }
  return index;
}

// Download + validate with bounded retries (default waits 5 s, 20 s, 60 s).
export async function downloadValidatedList({
  url = FSF_CSV_1_1_URL,
  fetchImpl = globalThis.fetch,
  minEntities = DEFAULT_MIN_ENTITIES,
  retryDelaysMs = [5000, 20000, 60000],
  timeoutMs = 120000,
  logger = null,
} = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt++) {
    try {
      const payload = await fetchWithCookies(url, { fetchImpl, timeoutMs });
      const index = validateSanctionsPayload(payload, { minEntities });
      return { text: payload.text, index };
    } catch (e) {
      lastErr = e instanceof SanctionsListError ? e : new SanctionsListError(String(e?.message || e));
      if (attempt < retryDelaysMs.length) {
        logger?.warning?.(`EU FSF download attempt ${attempt + 1} failed (${lastErr.message}); retrying in ${Math.round(retryDelaysMs[attempt] / 1000)} s`);
        await sleep(retryDelaysMs[attempt]);
      }
    }
  }
  throw lastErr;
}

// --- cache stores ----------------------------------------------------------
// Interface: { name, read(): Promise<{gz:Buffer, meta}|null>, write(gz:Buffer, meta, {dataChanged}): Promise<void> }

export function createKvsCacheStore(kvs, name = 'apify-kvs') {
  return {
    name,
    async read() {
      const meta = await kvs.getValue(CACHE_META_KEY);
      if (!meta) return null;
      const gz = await kvs.getValue(CACHE_DATA_KEY);
      if (!gz) return null;
      return { gz: Buffer.isBuffer(gz) ? gz : Buffer.from(gz), meta };
    },
    async write(gz, meta, { dataChanged = true } = {}) {
      if (dataChanged) await kvs.setValue(CACHE_DATA_KEY, gz, { contentType: 'application/gzip' });
      await kvs.setValue(CACHE_META_KEY, meta);
    },
  };
}

export function createFileCacheStore(dir = path.join(os.tmpdir(), 'eu-fsf-sanctions-cache'), { readOnly = false, name } = {}) {
  const dataPath = path.join(dir, 'eu-fsf-csv-1_1.csv.gz');
  const metaPath = path.join(dir, 'eu-fsf-csv-1_1.meta.json');
  return {
    name: name || `file:${dir}`,
    readOnly,
    async read() {
      if (!fs.existsSync(metaPath) || !fs.existsSync(dataPath)) return null;
      return { gz: fs.readFileSync(dataPath), meta: JSON.parse(fs.readFileSync(metaPath, 'utf8')) };
    },
    async write(gz, meta, { dataChanged = true } = {}) {
      fs.mkdirSync(dir, { recursive: true });
      if (dataChanged) fs.writeFileSync(dataPath, gz);
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    },
  };
}

// Read-only store backed by public HTTP record URLs (e.g. a shared seed key-value store).
export function createHttpReadOnlyCacheStore(baseUrl, { fetchImpl = globalThis.fetch } = {}) {
  return {
    name: `http:${baseUrl}`,
    readOnly: true,
    async read() {
      const mr = await fetchImpl(`${baseUrl}/records/${CACHE_META_KEY}`);
      if (!mr.ok) return null;
      const meta = await mr.json();
      const dr = await fetchImpl(`${baseUrl}/records/${CACHE_DATA_KEY}`);
      if (!dr.ok) return null;
      return { gz: Buffer.from(await dr.arrayBuffer()), meta };
    },
    async write() {},
  };
}

export const KVS_RECORD_LIMIT_BYTES = 9 * 1024 * 1024; // Apify key-value store record limit
const MAX_CACHE_GZ_BYTES = 8.5 * 1024 * 1024;

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function ageHours(iso, now = Date.now()) {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Number(((now - t) / 3600000).toFixed(1)) : null;
}

export function staleWarningText(fileGenerationDate, fetchedAt) {
  return `STALE LIST: the official EU FSF download is currently unavailable, so this result uses the last successfully downloaded copy (file generated ${fileGenerationDate}, fetched ${fetchedAt}). Designations, amendments and delistings published after that date are NOT included. Re-screen once the official list is available again.`;
}

// Fields describing list freshness; spread into every output row/response.
export function listStatusFields(index) {
  const f = index?.listFreshness;
  if (!f) return { listStatus: 'fresh', listFetchedAt: null, listAgeHours: null, upstreamError: null, staleWarning: null };
  return {
    listStatus: f.listStatus,
    listFetchedAt: f.listFetchedAt,
    listAgeHours: f.listFetchedAt ? ageHours(f.listFetchedAt) : null,
    upstreamError: f.upstreamError || null,
    staleWarning: f.listStatus === 'stale' ? staleWarningText(index.fileGenerationDate, f.listFetchedAt) : null,
  };
}

function withFreshness(index, freshness) {
  index.listFreshness = freshness;
  return index;
}

let _memCache = null;

export function _resetMemCache() {
  _memCache = null;
}

export async function loadSanctionsList({
  csvText,
  fetchImpl = globalThis.fetch,
  url = FSF_CSV_1_1_URL,
  cacheStores, // array, first = primary (written), others = read-only fallbacks
  cacheStore,
  maxAgeMs = 12 * 3600 * 1000, // in-process memory cache window (MCP server)
  freshCacheMaxAgeMs = 0, // use a persistent cache younger than this without downloading
  forceRefresh = false,
  retryDelaysMs = [5000, 20000, 60000],
  timeoutMs = 120000,
  logger = null,
} = {}) {
  if (csvText) {
    return withFreshness(parseSanctionsCsv(csvText), { listStatus: 'fresh', listFetchedAt: null, source: 'inline' });
  }
  if (!forceRefresh && _memCache && Date.now() - _memCache.loadedAt < maxAgeMs && _memCache.index.listFreshness?.listStatus === 'fresh') {
    return _memCache.index;
  }

  const stores = (cacheStores || (cacheStore ? [cacheStore] : [createFileCacheStore()])).filter(Boolean);
  const primary = stores.find((s) => !s.readOnly) || null;

  // Read the last-good cache (first store that has one).
  let cached = null;
  for (const store of stores) {
    try {
      const c = await store.read();
      if (c && c.gz && c.meta) {
        cached = { ...c, store };
        break;
      }
    } catch (e) {
      logger?.warning?.(`Sanctions cache read failed (${store.name}): ${e.message}`);
    }
  }

  const parseCached = () => {
    const text = zlib.gunzipSync(cached.gz).toString('utf8');
    if (cached.meta.sha256 && sha256(text) !== cached.meta.sha256) {
      throw new SanctionsListError(`Cached list failed integrity check (sha256 mismatch, ${cached.store.name})`, { kind: 'cache' });
    }
    return parseSanctionsCsv(text);
  };

  if (!forceRefresh && cached && freshCacheMaxAgeMs > 0 && Date.now() - Date.parse(cached.meta.fetchedAt) < freshCacheMaxAgeMs) {
    const index = withFreshness(parseCached(), { listStatus: 'fresh', listFetchedAt: cached.meta.fetchedAt, source: `cache:${cached.store.name}` });
    _memCache = { loadedAt: Date.now(), index };
    return index;
  }

  const cachedCount = Number(cached?.meta?.entityCount) || 0;
  const minEntities = cachedCount > 0 ? Math.max(1, Math.floor(cachedCount * MIN_ENTITY_RATIO)) : DEFAULT_MIN_ENTITIES;

  try {
    const { text, index } = await downloadValidatedList({ url, fetchImpl, minEntities, retryDelaysMs, timeoutMs, logger });
    const fetchedAt = new Date().toISOString();
    const hash = sha256(text);
    const meta = {
      fetchedAt,
      fileGenerationDate: index.fileGenerationDate,
      listPublicationDate: index.listPublicationDate,
      entityCount: index.totalEntities,
      sha256: hash,
      sourceUrl: url.replace(/token=[^&]+/, 'token=<documented-public-token>'),
      format: 'csvFullSanctionsList_1_1',
    };
    if (primary) {
      try {
        const dataChanged = !cached || cached.store !== primary || cached.meta.sha256 !== hash;
        const gz = dataChanged ? zlib.gzipSync(text, { level: 9 }) : null;
        if (gz && gz.length > MAX_CACHE_GZ_BYTES) {
          logger?.warning?.(`Sanctions cache not updated: gzipped list ${gz.length} bytes exceeds record limit`);
        } else {
          await primary.write(gz, { ...meta, gzBytes: gz ? gz.length : cached?.meta?.gzBytes ?? null }, { dataChanged });
        }
      } catch (e) {
        logger?.warning?.(`Sanctions cache write failed (${primary.name}): ${e.message}`);
      }
    }
    withFreshness(index, { listStatus: 'fresh', listFetchedAt: fetchedAt, source: 'download' });
    _memCache = { loadedAt: Date.now(), index };
    return index;
  } catch (err) {
    const upstreamError = String(err?.message || err);
    if (!cached) {
      throw new SanctionsListError(
        `EU sanctions list unavailable: the official EU FSF download failed (${upstreamError}) and no previously downloaded copy is cached yet. Screening cannot run without the list; please retry later.`,
        { kind: 'no-cache' }
      );
    }
    const index = withFreshness(parseCached(), {
      listStatus: 'stale',
      listFetchedAt: cached.meta.fetchedAt,
      upstreamError,
      source: `cache:${cached.store.name}`,
    });
    logger?.warning?.(staleWarningText(index.fileGenerationDate, cached.meta.fetchedAt));
    return index; // not memoised: retry upstream on the next call
  }
}

export function formatEntityPublic(ent) {
  return {
    logicalId: ent.logicalId,
    euReferenceNumber: ent.euReferenceNumber,
    unitedNationId: ent.unitedNationId,
    subjectType: ent.subjectType,
    programme: ent.programme,
    primaryName: ent.primaryName,
    aliases: ent.names.map((n) => n.wholeName),
    functions: [...new Set(ent.names.map((n) => n.function).filter(Boolean))],
    birthDates: ent.birthDates,
    citizenships: ent.citizenships,
    countries: ent.countries,
    addresses: ent.addresses,
    identifications: ent.identifications.map(({ number, typeCode, typeDescription, countryIso2 }) => ({
      number,
      typeCode,
      typeDescription,
      countryIso2,
    })),
    designationDate: ent.designationDate,
    regulationNumberTitle: ent.regulationNumberTitle,
    regulationPublicationDate: ent.regulationPublicationDate,
    regulationPublicationUrl: ent.regulationPublicationUrl,
    remark: ent.remark,
  };
}

export function screenOne(index, rawQuery, {
  subjectType = 'all',
  programmes = [],
  country = '',
  fuzzyThreshold = 0.78,
  maxMatches = 5,
} = {}) {
  const env = { ...complianceEnvelope(index.fileGenerationDate), ...listStatusFields(index) };
  const qObj = typeof rawQuery === 'string' ? { name: rawQuery } : (rawQuery || {});
  const queryStr = String(qObj.name || qObj.query || qObj.idNumber || '').trim();
  const queryIdNorm = normalizeId(qObj.idNumber || queryStr);
  const queryNameNorm = normalizeName(queryStr);
  const queryTokens = queryNameNorm ? queryNameNorm.split(' ').filter(Boolean) : [];
  const filterType = (qObj.type || subjectType || 'all').toLowerCase();
  const filterCountry = (qObj.country || country || '').toUpperCase().trim();
  const filterBirthYear = qObj.birthYear ? String(qObj.birthYear).trim() : '';
  const progSet = new Set((programmes || []).map((p) => String(p).toUpperCase().trim()).filter(Boolean));
  if (qObj.programme) progSet.add(String(qObj.programme).toUpperCase().trim());

  const candidates = [];

  for (const ent of index.entities) {
    if (filterType !== 'all' && ent.subjectType !== filterType) continue;
    if (progSet.size > 0 && (!ent.programme || !progSet.has(ent.programme.toUpperCase()))) continue;
    if (filterCountry && !ent.countries.includes(filterCountry)) continue;

    let bestScore = 0;
    let matchedOn = null;
    let matchedValue = null;
    let isExact = false;

    // 1. Check exact EU Reference Number or Logical ID or UN ID
    if (ent.euReferenceNumber && normalizeId(ent.euReferenceNumber) === queryIdNorm) {
      bestScore = 1.0;
      matchedOn = 'euReferenceNumber';
      matchedValue = ent.euReferenceNumber;
      isExact = true;
    } else if (ent.unitedNationId && normalizeId(ent.unitedNationId) === queryIdNorm) {
      bestScore = 1.0;
      matchedOn = 'unitedNationId';
      matchedValue = ent.unitedNationId;
      isExact = true;
    }

    // 2. Check exact identification / passport / registration number
    if (!isExact && queryIdNorm.length >= 4) {
      for (const idObj of ent.identifications) {
        if (idObj.norm === queryIdNorm) {
          bestScore = 1.0;
          matchedOn = 'identificationNumber';
          matchedValue = idObj.number;
          isExact = true;
          break;
        }
      }
    }

    // 3. Check all name aliases (exact and fuzzy)
    if (!isExact && queryNameNorm) {
      for (const n of ent.names) {
        if (n.norm === queryNameNorm) {
          bestScore = 1.0;
          matchedOn = 'name';
          matchedValue = n.wholeName;
          isExact = true;
          break;
        }
        const sim = nameSimilarity(queryNameNorm, n.norm, queryTokens, n.tokens);
        if (sim > bestScore) {
          bestScore = sim;
          matchedOn = 'name';
          matchedValue = n.wholeName;
        }
      }
    }

    if (bestScore >= fuzzyThreshold) {
      const birthYearMatch = filterBirthYear
        ? ent.birthDates.some((b) => b.year === filterBirthYear || (b.birthDate && b.birthDate.startsWith(filterBirthYear)))
        : null;

      // CRITICAL COMPLIANCE RULE (Decision 2011/833/EU Art. 6(2) non-distortion):
      // Any non-exact match MUST be labeled "possible match", never a determination.
      const matchType = isExact ? 'exact match' : 'possible match';
      const matchLabel = isExact ? 'exact match' : POSSIBLE_MATCH_LABEL;

      candidates.push({
        query: queryStr,
        status: isExact ? 'exact_match' : 'possible_match',
        matchType,
        matchLabel,
        isExactMatch: isExact,
        possibleMatchWarning: isExact ? null : POSSIBLE_MATCH_WARNING,
        score: Number(bestScore.toFixed(4)),
        matchedOn,
        matchedValue,
        birthYearMatch,
        ...formatEntityPublic(ent),
        ...env,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score || a.primaryName?.localeCompare(b.primaryName || '') || 0);
  const topMatches = candidates.slice(0, maxMatches);
  const hasExact = topMatches.some((m) => m.isExactMatch);
  const hasPossible = topMatches.some((m) => !m.isExactMatch);

  return {
    query: queryStr,
    status: hasExact ? 'exact_match' : hasPossible ? 'possible_match' : 'clear',
    matchCount: topMatches.length,
    matches: topMatches,
    ...env,
  };
}

export function screenBatch(index, queries = [], options = {}) {
  const env = { ...complianceEnvelope(index.fileGenerationDate), ...listStatusFields(index) };
  const includeClearQueries = options.includeClearQueries !== false;
  const results = [];
  const datasetRows = [];
  let queriesWithExactMatch = 0;
  let queriesWithPossibleMatch = 0;
  let queriesClear = 0;

  for (const q of queries) {
    const res = screenOne(index, q, options);
    results.push(res);
    if (res.status === 'exact_match') queriesWithExactMatch++;
    else if (res.status === 'possible_match') queriesWithPossibleMatch++;
    else queriesClear++;

    if (res.matches.length > 0) {
      for (const m of res.matches) {
        datasetRows.push(m);
      }
    } else if (includeClearQueries) {
      datasetRows.push({
        query: res.query,
        status: 'clear',
        matchType: 'no match',
        matchLabel: 'no match above threshold',
        isExactMatch: false,
        possibleMatchWarning: null,
        score: 0,
        matchedOn: null,
        matchedValue: null,
        logicalId: null,
        euReferenceNumber: null,
        subjectType: null,
        programme: null,
        primaryName: null,
        ...env,
      });
    }
  }

  return {
    totalScreened: queries.length,
    queriesWithExactMatch,
    queriesWithPossibleMatch,
    queriesClear,
    results,
    datasetRows,
    ...env,
  };
}

export function lookupEntities(index, {
  euReferenceNumber,
  logicalId,
  programme,
  subjectType = 'all',
  country,
  limit = 25,
} = {}) {
  const env = { ...complianceEnvelope(index.fileGenerationDate), ...listStatusFields(index) };
  const refNorm = euReferenceNumber ? normalizeId(euReferenceNumber) : null;
  const idStr = logicalId ? String(logicalId).trim() : null;
  const progUpper = programme ? String(programme).toUpperCase().trim() : null;
  const countryUpper = country ? String(country).toUpperCase().trim() : null;
  const typeLower = (subjectType || 'all').toLowerCase();

  const matches = [];
  for (const ent of index.entities) {
    if (refNorm && normalizeId(ent.euReferenceNumber) !== refNorm) continue;
    if (idStr && ent.logicalId !== idStr) continue;
    if (progUpper && (!ent.programme || ent.programme.toUpperCase() !== progUpper)) continue;
    if (typeLower !== 'all' && ent.subjectType !== typeLower) continue;
    if (countryUpper && !ent.countries.includes(countryUpper)) continue;

    matches.push({
      ...formatEntityPublic(ent),
      ...env,
    });
    if (matches.length >= limit) break;
  }

  return {
    count: matches.length,
    entities: matches,
    ...env,
  };
}
