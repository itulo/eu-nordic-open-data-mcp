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

let _memCache = null;

export async function loadSanctionsList({
  csvText,
  fetchImpl = globalThis.fetch,
  url = FSF_CSV_1_1_URL,
  cachePath = path.join(os.tmpdir(), 'eu-fsf-sanctions-1_1.csv'),
  maxAgeMs = 12 * 3600 * 1000,
  forceRefresh = false,
} = {}) {
  if (csvText) {
    return parseSanctionsCsv(csvText);
  }
  if (!forceRefresh && _memCache && Date.now() - _memCache.loadedAt < maxAgeMs) {
    return _memCache.index;
  }
  if (!forceRefresh && cachePath && fs.existsSync(cachePath)) {
    const stat = fs.statSync(cachePath);
    if (Date.now() - stat.mtimeMs < maxAgeMs && stat.size > 1000) {
      const cachedTxt = fs.readFileSync(cachePath, 'utf8');
      const index = parseSanctionsCsv(cachedTxt);
      _memCache = { loadedAt: Date.now(), index };
      return index;
    }
  }

  const res = await fetchImpl(url, {
    headers: { 'User-Agent': 'open-data-factory-eu-sanctions-screen/0.1 (+https://data.europa.eu)' },
  });
  if (!res.ok) {
    throw new Error(`EU FSF CSV download failed: HTTP ${res.status}`);
  }
  const text = await res.text();
  if (cachePath) {
    try {
      fs.writeFileSync(cachePath, text, 'utf8');
    } catch {
      // Ignore cache write errors on read-only filesystems
    }
  }
  const index = parseSanctionsCsv(text);
  _memCache = { loadedAt: Date.now(), index };
  return index;
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
  const env = complianceEnvelope(index.fileGenerationDate);
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
  const env = complianceEnvelope(index.fileGenerationDate);
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
  const env = complianceEnvelope(index.fileGenerationDate);
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
