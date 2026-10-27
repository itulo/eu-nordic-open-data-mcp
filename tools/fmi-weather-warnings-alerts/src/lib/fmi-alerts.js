// Core library for FMI Severe Weather & Marine Alerts (CAP 1.2) + Live Synoptic & Sea-Level Observations (WFS 2.0).
// Licence: Creative Commons Attribution 4.0 International (CC BY 4.0) — Ilmatieteen laitos (FMI).
import { attributionFor, createLimiter, HttpError } from './common.js';

export const FMI_CAP_ATOM_EN = 'https://alerts.fmi.fi/cap/feed/atom_en-GB.xml';
export const FMI_CAP_ATOM_FI = 'https://alerts.fmi.fi/cap/feed/atom_fi-FI.xml';
export const FMI_WFS_URL = 'https://opendata.fmi.fi/wfs';

export const DEFAULT_OBS_PLACES = ['Helsinki', 'Turku', 'Tampere', 'Vaasa', 'Oulu', 'Rovaniemi'];

export const SEVERITY_RANK = {
  Minor: 1,
  Moderate: 2,
  Severe: 3,
  Extreme: 4,
};

export function fmiAlertsAttribution(datasetFin = 'varoitukset (CAP) sekä sää- ja meriveden korkeushavainnot (WFS)', datasetEn = 'severe weather & marine alerts (CAP) and weather & sea-level observations (WFS)') {
  const base = attributionFor('fmi');
  const exactAttr = `Ilmatieteen laitoksen avoin data, ${datasetFin} (EN: Finnish Meteorological Institute open data, ${datasetEn}), CC BY 4.0`;
  return {
    ...base,
    attribution: exactAttr,
    sourceUrl: 'https://en.ilmatieteenlaitos.fi/open-data',
    modified: true,
    modificationNotice: 'Normalized from FMI CAP 1.2 Atom feed and WFS 2.0 simple features into flat JSON records with grid/marine risk indicators.',
  };
}

function tagVal(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m ? decodeXml(m[1].trim()) : null;
}

function decodeXml(s) {
  return String(s || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Parse FMI CAP 1.2 Atom XML into structured alert records.
 */
export function parseCapAtomXml(xmlText, { language = 'en-GB', includeCancelled = false, minSeverity = 'Minor', regionFilter = '', maxAlerts = 50 } = {}) {
  const attr = fmiAlertsAttribution('varoitukset (CAP-syöte)', 'weather and marine warnings (CAP feed)');
  const entries = [...String(xmlText || '').matchAll(/<entry>([\s\S]*?)<\/entry>/gi)].map((m) => m[1]);
  const minRank = SEVERITY_RANK[minSeverity] || 1;
  const regNeedle = String(regionFilter || '').trim().toLowerCase();
  const out = [];
  const seenKeys = new Set();

  for (const entry of entries) {
    const alertMatch = entry.match(/<alert[^>]*>([\s\S]*?)<\/alert>/i);
    if (!alertMatch) continue;
    const alertXml = alertMatch[1];
    const identifier = tagVal(alertXml, 'identifier') || tagVal(entry, 'id');
    const sent = tagVal(alertXml, 'sent') || tagVal(entry, 'updated');
    const status = tagVal(alertXml, 'status') || 'Actual';
    const msgType = tagVal(alertXml, 'msgType') || 'Alert';
    if (!includeCancelled && (msgType.toLowerCase() === 'cancel' || status.toLowerCase() !== 'actual')) {
      continue;
    }

    const infoBlocks = [...alertXml.matchAll(/<info>([\s\S]*?)<\/info>/gi)].map((m) => m[1]);
    if (!infoBlocks.length) continue;

    // Pick matching language block (default en-GB, fallback fi-FI or first)
    let chosenInfo = infoBlocks.find((b) => (tagVal(b, 'language') || '').toLowerCase() === language.toLowerCase())
      || infoBlocks.find((b) => (tagVal(b, 'language') || '').toLowerCase().startsWith('en'))
      || infoBlocks[0];

    const severity = tagVal(chosenInfo, 'severity') || 'Minor';
    if ((SEVERITY_RANK[severity] || 1) < minRank) continue;

    const urgency = tagVal(chosenInfo, 'urgency') || 'Expected';
    const certainty = tagVal(chosenInfo, 'certainty') || 'Likely';
    const event = tagVal(chosenInfo, 'event') || 'Weather Warning';
    const headline = tagVal(chosenInfo, 'headline') || tagVal(entry, 'title') || event;
    if (!includeCancelled && /^(REMOVED:|POISTETTU:|AVSLUTAD:)/i.test(headline)) continue;

    const description = tagVal(chosenInfo, 'description') || '';
    const effective = tagVal(chosenInfo, 'effective') || sent;
    const onset = tagVal(chosenInfo, 'onset') || effective;
    const expires = tagVal(chosenInfo, 'expires') || null;

    let eventCode = null;
    const ecMatch = chosenInfo.match(/<eventCode>([\s\S]*?)<\/eventCode>/i);
    if (ecMatch) eventCode = tagVal(ecMatch[1], 'value');

    const params = {};
    for (const pm of chosenInfo.matchAll(/<parameter>([\s\S]*?)<\/parameter>/gi)) {
      const k = tagVal(pm[1], 'valueName');
      const v = tagVal(pm[1], 'value');
      if (k && v !== null) params[k] = v;
    }

    const areas = [...chosenInfo.matchAll(/<area>([\s\S]*?)<\/area>/gi)]
      .map((m) => tagVal(m[1], 'areaDesc'))
      .filter(Boolean);
    const areaDisplay = areas.join(', ') || 'Finland';

    if (regNeedle && !areaDisplay.toLowerCase().includes(regNeedle) && !headline.toLowerCase().includes(regNeedle)) {
      continue;
    }

    const dedupeKey = `${eventCode || event}|${areaDisplay}|${onset}|${severity}`;
    if (seenKeys.has(dedupeKey)) continue;
    seenKeys.add(dedupeKey);

    const codeLower = String(eventCode || event).toLowerCase();
    const isGridOrMarineRisk = /wind|sea|wave|thunder|icing|snow|traffic|water|flood/i.test(codeLower);

    out.push({
      recordType: 'weather_alert',
      identifier,
      msgType,
      sentUtc: sent,
      onsetUtc: onset,
      expiresUtc: expires,
      language: tagVal(chosenInfo, 'language') || language,
      event,
      eventCode: eventCode || 'weatherWarning',
      severity,
      color: params.color || null,
      urgency,
      certainty,
      area: areaDisplay,
      headline,
      description,
      typicalImpacts: params.typicalImpacts || null,
      probabilityPct: params.probability !== undefined ? Number(params.probability) : null,
      isGridOrMarineRisk,
      ...attr,
    });

    if (out.length >= maxAlerts) break;
  }

  return out;
}

/**
 * Parse FMI WFS 2.0 simple feature observations (weather or mareograph).
 */
export function parseWfsSimpleObservations(xmlText, { place = 'Finland', recordType = 'weather_observation' } = {}) {
  const attr = fmiAlertsAttribution(
    recordType === 'sea_level_observation' ? 'meriveden korkeushavainnot (WFS)' : 'säähavainnot (WFS)',
    recordType === 'sea_level_observation' ? 'sea-level mareograph observations (WFS)' : 'synoptic weather station observations (WFS)'
  );
  const byStationTime = new Map();
  const memberRegex = /<wfs:member>([\s\S]*?)<\/wfs:member>/gi;
  let m;
  while ((m = memberRegex.exec(String(xmlText || ''))) !== null) {
    const block = m[1];
    const time = tagVal(block, 'BsWfs:Time');
    const param = tagVal(block, 'BsWfs:ParameterName');
    const valStr = tagVal(block, 'BsWfs:ParameterValue');
    const pos = tagVal(block, 'gml:pos');
    if (!time || !param) continue;
    const coords = pos ? pos.trim().split(/\s+/).map(Number) : [null, null];
    const key = `${pos || place}|${time}`;
    if (!byStationTime.has(key)) {
      byStationTime.set(key, {
        recordType,
        place,
        observedAtUtc: time,
        latitude: Number.isFinite(coords[0]) ? coords[0] : null,
        longitude: Number.isFinite(coords[1]) ? coords[1] : null,
        metrics: {},
      });
    }
    const num = Number(valStr);
    byStationTime.get(key).metrics[param.toLowerCase()] = Number.isFinite(num) ? num : null;
  }

  const rows = [];
  for (const item of byStationTime.values()) {
    const p = item.metrics;
    if (recordType === 'sea_level_observation') {
      rows.push({
        recordType: 'sea_level_observation',
        place: item.place,
        observedAtUtc: item.observedAtUtc,
        latitude: item.latitude,
        longitude: item.longitude,
        seaLevelMm: p.watlev ?? null,
        waterTempC: p.tw_pt1h_avg ?? null,
        ...attr,
      });
    } else {
      rows.push({
        recordType: 'weather_observation',
        place: item.place,
        observedAtUtc: item.observedAtUtc,
        latitude: item.latitude,
        longitude: item.longitude,
        temperatureC: p.t2m ?? null,
        windSpeedMs: p.ws_10min ?? null,
        windGustMs: p.wg_10min ?? null,
        windDirectionDeg: p.wd_10min ?? null,
        relativeHumidityPct: p.rh ?? null,
        precipitation1hMm: p.r_1h ?? null,
        snowDepthCm: p.snow_aws ?? null,
        pressureHpa: p.p_sea ?? null,
        visibilityMeters: p.vis ?? null,
        ...attr,
      });
    }
  }
  return rows.sort((a, b) => String(b.observedAtUtc).localeCompare(String(a.observedAtUtc)));
}

export function createFmiAlertsClient({ fetchImpl = globalThis.fetch, minIntervalMs = 300 } = {}) {
  const limiter = createLimiter(minIntervalMs);

  async function fetchXml(url) {
    const res = await limiter(() => fetchImpl(url, {
      headers: {
        accept: 'application/xml, text/xml, */*',
        'user-agent': 'open-data-tool-factory/0.1 (+fmi-weather-warnings-alerts)',
      },
      signal: AbortSignal.timeout(30000),
    }));
    const text = await res.text();
    if (!res.ok) throw new HttpError(res.status, text, url);
    return text;
  }

  return {
    async fetchActiveAlerts(opts = {}) {
      const feedUrl = (opts.language || 'en-GB').toLowerCase().startsWith('fi') ? FMI_CAP_ATOM_FI : FMI_CAP_ATOM_EN;
      const xml = await fetchXml(feedUrl);
      return parseCapAtomXml(xml, opts);
    },
    async fetchWeatherObservations({ places = DEFAULT_OBS_PLACES, hoursBack = 2 } = {}) {
      const startIso = new Date(Date.now() - Math.max(1, hoursBack) * 3600_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
      const all = [];
      for (const place of places) {
        const params = new URLSearchParams({
          service: 'WFS',
          version: '2.0.0',
          request: 'getFeature',
          storedquery_id: 'fmi::observations::weather::simple',
          place,
          timestep: '60',
          starttime: startIso,
          parameters: 't2m,ws_10min,wg_10min,wd_10min,rh,r_1h,snow_aws,p_sea,vis',
        });
        const xml = await fetchXml(`${FMI_WFS_URL}?${params.toString()}`);
        const parsed = parseWfsSimpleObservations(xml, { place, recordType: 'weather_observation' });
        if (parsed.length) all.push(parsed[0]); // latest observation for place
      }
      return all;
    },
    async fetchSeaLevelObservations({ hoursBack = 2, maxStations = 15 } = {}) {
      const startIso = new Date(Date.now() - Math.max(1, hoursBack) * 3600_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
      const params = new URLSearchParams({
        service: 'WFS',
        version: '2.0.0',
        request: 'getFeature',
        storedquery_id: 'fmi::observations::mareograph::simple',
        timestep: '60',
        starttime: startIso,
      });
      const xml = await fetchXml(`${FMI_WFS_URL}?${params.toString()}`);
      const parsed = parseWfsSimpleObservations(xml, { place: 'Baltic Coast (Finland)', recordType: 'sea_level_observation' });
      // Deduplicate by coordinate pair to return latest reading per mareograph station
      const byCoord = new Map();
      for (const r of parsed) {
        const k = `${r.latitude},${r.longitude}`;
        if (!byCoord.has(k)) byCoord.set(k, r);
        if (byCoord.size >= maxStations) break;
      }
      return [...byCoord.values()];
    },
  };
}
