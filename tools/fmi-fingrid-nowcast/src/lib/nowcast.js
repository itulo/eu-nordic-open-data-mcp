// Core library: FMI Weather + Fingrid Wind/Solar/Consumption Joined Nowcast Feature Feed.
// Shared by the Apify actor (src/main.js) and the MCP server (src/mcp-server.js).
//
// Data sources (both CC BY 4.0):
// 1. Finnish Meteorological Institute (FMI) Open Data WFS 2.0 (https://opendata.fmi.fi/wfs) — no API key required.
// 2. Fingrid Open Data API (https://data.fingrid.fi/api) — requires free API key in `x-api-key` header (never in URL).
//
// HARD RULES:
// - Every output record and MCP response (including errors) carries BOTH required CC BY 4.0 attributions
//   from licences.json (Fingrid + FMI with the dataset name filled in).
// - No FMI, Fingrid, PRH, TED, ENTSO-E, or EU logos or look-alike UIs.
// - No Nord Pool or ENTSO-E day-ahead electricity exchange prices anywhere.
// - Never log, echo, or output the Fingrid API key.

import { licences, createLimiter, fetchJson, HttpError } from './common.js';

export const FMI_WFS_URL = 'https://opendata.fmi.fi/wfs';
export const FINGRID_API_BASE = 'https://data.fingrid.fi/api';
export const FMI_STORED_QUERY = 'fmi::forecast::edited::weather::scandinavia::point::simple';
export const FMI_DATASET_NAME = 'SmartMet / HARMONIE-MEPS surface weather point forecast (WFS)';

// Fingrid rate limit: 1 request / 2 seconds per API key.
const sharedFingridLimiter = createLimiter(2100);
// FMI rate limit: max 600 queries / 5 min (~2 req/s); keep polite 350ms spacing.
const sharedFmiLimiter = createLimiter(350);

/**
 * Representative Finnish wind & solar production hubs:
 * - Oulu (North Ostrobothnia onshore/coastal wind cluster)
 * - Vaasa (Ostrobothnia coastal wind hub)
 * - Pori (Satakunta coastal wind + west coast solar)
 * - Helsinki (Uusimaa demand center & southern solar)
 * - Lappeenranta (South Karelia eastern solar & demand)
 */
export const DEFAULT_HUBS = [
  { name: 'Oulu', lat: 65.0124, lon: 25.4682, windWeight: 0.35, solarWeight: 0.10, demandWeight: 0.12 },
  { name: 'Vaasa', lat: 63.0960, lon: 21.6158, windWeight: 0.30, solarWeight: 0.15, demandWeight: 0.10 },
  { name: 'Pori', lat: 61.4833, lon: 21.7833, windWeight: 0.20, solarWeight: 0.20, demandWeight: 0.13 },
  { name: 'Helsinki', lat: 60.1695, lon: 24.9355, windWeight: 0.10, solarWeight: 0.35, demandWeight: 0.45 },
  { name: 'Lappeenranta', lat: 61.0587, lon: 28.1887, windWeight: 0.05, solarWeight: 0.20, demandWeight: 0.20 },
];

export const FINGRID_NOWCAST_DATASETS = {
  245: { key: 'wind_forecast', name: 'Wind power generation forecast - updated every 15 minutes', unit: 'MWh/h' },
  248: { key: 'solar_forecast', name: 'Solar power generation forecast - updated every 15 minutes', unit: 'MWh/h' },
  166: { key: 'consumption_forecast', name: 'Electricity consumption forecast - updated every 15 minutes', unit: 'MW' },
  75: { key: 'wind_actual_15min', name: 'Wind power generation - 15 min data', unit: 'MW' },
  181: { key: 'wind_actual_rt', name: 'Wind power production - real-time data', unit: 'MW' },
  193: { key: 'consumption_actual_rt', name: 'Electricity consumption in Finland - real-time data', unit: 'MW' },
};

export class MissingApiKeyError extends Error {
  constructor() {
    super('FINGRID_API_KEY is not set. Register free at https://data.fingrid.fi (developer portal, "Open Data starter") and pass fingridApiKey in input or set env FINGRID_API_KEY.');
  }
}

export function dualAttribution() {
  const reg = licences().sources;
  const fg = reg.fingrid;
  const fmi = reg.fmi;
  const fmiAttr = fmi.attribution.replace(/<aineiston nimi>/g, 'sääennusteet (WFS)').replace(/<dataset name>/g, FMI_DATASET_NAME);
  const fgAttr = fg.attribution;
  return {
    attribution: `${fgAttr} | ${fmiAttr}`,
    fingridAttribution: fgAttr,
    fmiAttribution: fmiAttr,
    licence: 'Creative Commons Attribution 4.0 International (CC BY 4.0)',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    termsUrls: {
      fingrid: fg.termsUrl,
      fmi: fmi.termsUrl,
    },
  };
}

const HEL = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Helsinki',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
export const helsinkiTime = (iso) => HEL.format(new Date(iso)).replace(' ', 'T');

const round = (x, d = 2) => (x === null || x === undefined || Number.isNaN(x) ? null : Math.round(x * 10 ** d) / 10 ** d);

/** Match a `<gml:pos>lat lon</gml:pos>` coordinate string to the closest requested hub. */
function matchHub(posStr, hubs) {
  const parts = String(posStr || '').trim().split(/\s+/).map(Number);
  if (parts.length < 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return hubs[0]?.name || 'Unknown';
  const [lat, lon] = parts;
  let best = hubs[0]?.name || `${lat},${lon}`;
  let bestDist = Infinity;
  for (const h of hubs) {
    if (typeof h.lat !== 'number' || typeof h.lon !== 'number') continue;
    const d = (h.lat - lat) ** 2 + (h.lon - lon) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = h.name;
    }
  }
  return bestDist < 1.5 ? best : `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

/**
 * Parse FMI `BsWfsElement` XML (`fmi::forecast::edited::weather::scandinavia::point::simple`)
 * into normalized station-hour weather observations/forecasts.
 */
export function parseFmiSimpleXml(xml, hubs = DEFAULT_HUBS) {
  const byStationHour = new Map();
  const blockRe = /<BsWfs:BsWfsElement\b[\s\S]*?<\/BsWfs:BsWfsElement>/g;
  let m;
  while ((m = blockRe.exec(xml)) !== null) {
    const block = m[0];
    const pos = block.match(/<gml:pos>([^<]+)<\/gml:pos>/)?.[1]?.trim();
    const time = block.match(/<BsWfs:Time>([^<]+)<\/BsWfs:Time>/)?.[1]?.trim();
    const param = block.match(/<BsWfs:ParameterName>([^<]+)<\/BsWfs:ParameterName>/)?.[1]?.trim();
    const valStr = block.match(/<BsWfs:ParameterValue>([^<]+)<\/BsWfs:ParameterValue>/)?.[1]?.trim();
    if (!time || !param) continue;
    const val = Number(valStr);
    if (!Number.isFinite(val)) continue;
    const hourDate = new Date(time);
    if (Number.isNaN(hourDate.getTime())) continue;
    hourDate.setUTCMinutes(0, 0, 0);
    const hourIso = hourDate.toISOString();
    const place = matchHub(pos, hubs);
    const key = `${place}|${hourIso}`;
    let entry = byStationHour.get(key);
    if (!entry) {
      const [lat, lon] = String(pos || '').split(/\s+/).map(Number);
      entry = {
        place,
        hourStartUtc: hourIso,
        lat: Number.isFinite(lat) ? round(lat, 4) : null,
        lon: Number.isFinite(lon) ? round(lon, 4) : null,
        temperatureC: null,
        windSpeedMs: null,
        windGustMs: null,
        windDirectionDeg: null,
        cloudCoverPct: null,
        globalRadiationWm2: null,
      };
      byStationHour.set(key, entry);
    }
    if (param === 'Temperature') entry.temperatureC = round(val, 2);
    else if (param === 'WindSpeedMS') entry.windSpeedMs = round(val, 2);
    else if (param === 'HourlyMaximumGust') entry.windGustMs = round(val, 2);
    else if (param === 'WindDirection') entry.windDirectionDeg = round(val, 1);
    else if (param === 'TotalCloudCover') entry.cloudCoverPct = round(val, 1);
    else if (param === 'RadiationGlobal') entry.globalRadiationWm2 = round(val, 1);
  }
  return [...byStationHour.values()].sort((a, b) => a.hourStartUtc.localeCompare(b.hourStartUtc) || a.place.localeCompare(b.place));
}

/**
 * Compute hourly wind/solar/demand-weighted meteorological features across Finnish hubs.
 */
export function aggregateWeatherByHour(stationRows, hubs = DEFAULT_HUBS) {
  const hubMap = new Map(hubs.map((h) => [h.name.toLowerCase(), h]));
  const byHour = new Map();
  for (const r of stationRows) {
    let list = byHour.get(r.hourStartUtc);
    if (!list) {
      list = [];
      byHour.set(r.hourStartUtc, list);
    }
    list.push(r);
  }

  const out = new Map();
  for (const [hourIso, rows] of byHour.entries()) {
    const weightedAvg = (field, weightField) => {
      let sumW = 0;
      let sumV = 0;
      for (const r of rows) {
        const v = r[field];
        if (typeof v !== 'number') continue;
        const h = hubMap.get(r.place.toLowerCase());
        const w = h?.[weightField] ?? (1 / rows.length);
        sumW += w;
        sumV += v * w;
      }
      return sumW > 0 ? sumV / sumW : null;
    };

    const windSpeedWeightedMs = weightedAvg('windSpeedMs', 'windWeight');
    const windGustWeightedMs = weightedAvg('windGustMs', 'windWeight');
    const radiationWeightedWm2 = weightedAvg('globalRadiationWm2', 'solarWeight');
    const cloudCoverWeightedPct = weightedAvg('cloudCoverPct', 'solarWeight');
    const tempDemandWeightedC = weightedAvg('temperatureC', 'demandWeight');
    // Heating Degree Hours (base 17°C in Finland): drives electric heating load
    const heatingDegreeHoursC = tempDemandWeightedC !== null ? Math.max(0, 17 - tempDemandWeightedC) : null;
    // Cut-out storm risk: gusts >= 25 m/s at any major wind hub can cause turbine cut-out ramps
    const maxHubGustMs = rows.reduce((m, r) => (typeof r.windGustMs === 'number' && r.windGustMs > m ? r.windGustMs : m), 0);

    out.set(hourIso, {
      hourStartUtc: hourIso,
      fmiWindSpeedWeightedMs: round(windSpeedWeightedMs, 2),
      fmiWindGustWeightedMs: round(windGustWeightedMs, 2),
      fmiMaxHubGustMs: maxHubGustMs > 0 ? round(maxHubGustMs, 2) : null,
      fmiStormCutoutRisk: maxHubGustMs >= 24,
      fmiRadiationWeightedWm2: round(radiationWeightedWm2, 1),
      fmiCloudCoverWeightedPct: round(cloudCoverWeightedPct, 1),
      fmiTempDemandWeightedC: round(tempDemandWeightedC, 2),
      fmiHeatingDegreeHoursC: round(heatingDegreeHoursC, 2),
      stationsIncluded: rows.map((r) => r.place),
      stationSnapshots: rows,
    });
  }
  return out;
}

function hourlyMeans(rows, datasetId) {
  const m = new Map();
  for (const r of rows) {
    if (r.datasetId !== datasetId || typeof r.value !== 'number') continue;
    const h = new Date(r.startTime);
    h.setUTCMinutes(0, 0, 0);
    const k = h.toISOString();
    const e = m.get(k) || { sum: 0, n: 0 };
    e.sum += r.value;
    e.n++;
    m.set(k, e);
  }
  return new Map([...m].map(([k, e]) => [k, e.sum / e.n]));
}

const MODIFICATION_NOTICE =
  'Modified: joined FMI WFS hourly weather forecasts (wind speed, gusts, global solar radiation, cloud cover, temperature, heating degree hours across Finnish wind/solar/demand hubs) with Fingrid Open Data hourly wind/solar/consumption forecasts and actuals (datasets 245, 248, 166, 75). Derived residual load, renewable share, 1h wind/residual ramp rates, storm cut-out flag, and EV smart-charging rank. Contains NO Nord Pool or ENTSO-E day-ahead electricity exchange prices.';

/**
 * Join FMI station-hour weather rows and Fingrid dataset rows into an hourly nowcast feature feed.
 */
export function buildJoinedNowcast(fmiStationRows, fingridRows, {
  hubs = DEFAULT_HUBS,
  topN = 6,
  includeStationBreakdown = false,
  retrievedAt = new Date().toISOString(),
} = {}) {
  const weatherByHour = aggregateWeatherByHour(fmiStationRows, hubs);
  const windFc = hourlyMeans(fingridRows, 245);
  const solarFc = hourlyMeans(fingridRows, 248);
  const consFc = hourlyMeans(fingridRows, 166);
  const windAct = hourlyMeans(fingridRows, 75);

  const allHours = new Set([
    ...weatherByHour.keys(),
    ...windFc.keys(),
    ...consFc.keys(),
  ]);
  const sortedHours = [...allHours].sort();

  const preliminary = [];
  for (const h of sortedHours) {
    const w = weatherByHour.get(h);
    const wf = windFc.get(h) ?? null;
    const sf = solarFc.get(h) ?? 0;
    const cf = consFc.get(h) ?? null;
    const wa = windAct.get(h) ?? null;
    // Keep hours that have both FMI weather and at least wind or consumption from Fingrid
    if (!w || (wf === null && cf === null)) continue;

    const renTotal = (wf ?? 0) + (sf ?? 0);
    const residual = cf !== null && wf !== null ? cf - renTotal : null;
    const renShare = cf !== null && cf > 0 && wf !== null ? (renTotal / cf) * 100 : null;
    const windForecastErrorMW = wa !== null && wf !== null ? wa - wf : null;

    preliminary.push({
      hourStartUtc: h,
      hourStartHelsinki: helsinkiTime(h),
      fmiWindSpeedWeightedMs: w.fmiWindSpeedWeightedMs,
      fmiWindGustWeightedMs: w.fmiWindGustWeightedMs,
      fmiMaxHubGustMs: w.fmiMaxHubGustMs,
      fmiStormCutoutRisk: w.fmiStormCutoutRisk,
      fmiRadiationWeightedWm2: w.fmiRadiationWeightedWm2,
      fmiCloudCoverWeightedPct: w.fmiCloudCoverWeightedPct,
      fmiTempDemandWeightedC: w.fmiTempDemandWeightedC,
      fmiHeatingDegreeHoursC: w.fmiHeatingDegreeHoursC,
      fingridWindForecastMW: round(wf, 1),
      fingridSolarForecastMW: round(sf, 1),
      fingridRenewableForecastMW: wf !== null ? round(renTotal, 1) : null,
      fingridConsumptionForecastMW: round(cf, 1),
      fingridWindActualMW: round(wa, 1),
      windForecastErrorMW: round(windForecastErrorMW, 1),
      residualLoadMW: round(residual, 1),
      renewableSharePct: round(renShare, 1),
      stationsIncluded: w.stationsIncluded,
      ...(includeStationBreakdown ? { stationSnapshots: w.stationSnapshots } : {}),
    });
  }

  // Rank hours by residualLoadMW ascending (lowest residual load = best EV charging / highest renewable surplus)
  const withResidual = preliminary.filter((r) => typeof r.residualLoadMW === 'number');
  const sortedByResidual = [...withResidual].sort((a, b) => a.residualLoadMW - b.residualLoadMW);
  const rankMap = new Map(sortedByResidual.map((r, i) => [r.hourStartUtc, i + 1]));
  const minRes = sortedByResidual[0]?.residualLoadMW ?? 0;
  const maxRes = sortedByResidual.at(-1)?.residualLoadMW ?? 0;

  const attr = dualAttribution();

  return preliminary.map((item, idx) => {
    const prev = idx > 0 ? preliminary[idx - 1] : null;
    const windRamp1hMW =
      prev && typeof item.fingridWindForecastMW === 'number' && typeof prev.fingridWindForecastMW === 'number'
        ? round(item.fingridWindForecastMW - prev.fingridWindForecastMW, 1)
        : null;
    const residualRamp1hMW =
      prev && typeof item.residualLoadMW === 'number' && typeof prev.residualLoadMW === 'number'
        ? round(item.residualLoadMW - prev.residualLoadMW, 1)
        : null;

    const rnk = rankMap.get(item.hourStartUtc) ?? null;
    const score =
      typeof item.residualLoadMW === 'number'
        ? maxRes === minRes
          ? 100
          : round((100 * (maxRes - item.residualLoadMW)) / (maxRes - minRes), 0)
        : null;

    let regime = 'normal';
    if (item.fmiStormCutoutRisk) regime = 'storm_cutout_risk';
    else if (rnk !== null && rnk <= topN) regime = 'surplus_low_residual';
    else if (typeof item.residualLoadMW === 'number' && maxRes > minRes && item.residualLoadMW >= minRes + 0.8 * (maxRes - minRes)) {
      regime = 'tight_high_residual';
    }

    return {
      recordType: 'nowcast_hour',
      ...item,
      windRamp1hMW,
      residualRamp1hMW,
      rank: rnk,
      nowcastScore: score,
      isEvChargeRecommended: rnk !== null && rnk <= topN && !item.fmiStormCutoutRisk,
      regime,
      basisFingridDatasets: [245, 248, 166, 75],
      fmiStoredQueryId: FMI_STORED_QUERY,
      modified: true,
      modificationNotice: MODIFICATION_NOTICE,
      retrievedAt,
      ...attr,
    };
  });
}

/**
 * Create a dual client for FMI WFS + Fingrid Open Data API.
 */
export function createNowcastClient({
  fingridApiKey = process.env.FINGRID_API_KEY,
  fetchImpl = globalThis.fetch,
  fingridMinIntervalMs,
  fmiMinIntervalMs,
} = {}) {
  const fgLimiter = fingridMinIntervalMs !== undefined ? createLimiter(fingridMinIntervalMs) : sharedFingridLimiter;
  const fmiLimiter = fmiMinIntervalMs !== undefined ? createLimiter(fmiMinIntervalMs) : sharedFmiLimiter;

  async function fetchFmiXml({ places = DEFAULT_HUBS.map((h) => h.name), startTime, endTime, timestepMinutes = 60 } = {}) {
    const qs = new URLSearchParams({
      service: 'WFS',
      version: '2.0.0',
      request: 'getFeature',
      storedquery_id: FMI_STORED_QUERY,
      timestep: String(timestepMinutes),
      parameters: 'Temperature,WindSpeedMS,HourlyMaximumGust,WindDirection,TotalCloudCover,RadiationGlobal',
    });
    if (startTime) qs.set('starttime', new Date(startTime).toISOString().replace(/\.\d+Z$/, 'Z'));
    if (endTime) qs.set('endtime', new Date(endTime).toISOString().replace(/\.\d+Z$/, 'Z'));
    for (const p of places) qs.append('place', p);

    const url = `${FMI_WFS_URL}?${qs.toString()}`;
    const doFetch = () => fetchImpl(url, {
      headers: {
        accept: 'application/xml, text/xml',
        'user-agent': 'open-data-tool-factory/0.1 (+contact: maintainer)',
      },
      signal: AbortSignal.timeout(30000),
    });
    const res = fmiLimiter ? await fmiLimiter(doFetch) : await doFetch();
    const text = await res.text();
    if (!res.ok) throw new HttpError(res.status, text, url);
    return text;
  }

  async function fetchFingridTimeseries(ids, { startTime, endTime, pageSize = 20000, maxPages = 5 } = {}) {
    if (!fingridApiKey) throw new MissingApiKeyError();
    const headers = { 'x-api-key': fingridApiKey }; // header only, never in URL
    const rows = [];
    for (let page = 1; page <= maxPages; page++) {
      const qs = new URLSearchParams({
        datasets: ids.join(','),
        format: 'json',
        pageSize: String(pageSize),
        page: String(page),
        sortBy: 'startTime',
        sortOrder: 'asc',
      });
      if (startTime) qs.set('startTime', new Date(startTime).toISOString());
      if (endTime) qs.set('endTime', new Date(endTime).toISOString());
      const res = await fetchJson(`${FINGRID_API_BASE}/data?${qs}`, {
        headers,
        fetchImpl,
        limiter: fgLimiter,
      });
      rows.push(...(res?.data || []));
      if (!res?.pagination?.nextPage) break;
    }
    return rows;
  }

  return {
    fetchFmiXml,
    fetchFingridTimeseries,
  };
}

/**
 * High-level runner for Apify actor and MCP server.
 * Modes:
 * - `joined_nowcast`: Hourly joined FMI weather + Fingrid wind/solar/consumption feature feed (with EV charging rank & ramp rates).
 * - `station_weather`: Normalized FMI hub-level hourly weather forecast rows (no Fingrid API key required).
 */
export async function runNowcast({
  mode = 'joined_nowcast',
  client,
  places = DEFAULT_HUBS.map((h) => h.name),
  hoursBack = 6,
  hoursAhead = 36,
  topN = 6,
  includeStationBreakdown = false,
  now = new Date(),
} = {}) {
  const retrievedAt = new Date().toISOString();
  const H = 3600e3;
  const start = new Date(now.getTime() - hoursBack * H);
  start.setUTCMinutes(0, 0, 0);
  const end = new Date(now.getTime() + hoursAhead * H);
  end.setUTCMinutes(0, 0, 0);

  const hubs = DEFAULT_HUBS.filter((h) => places.some((p) => p.toLowerCase() === h.name.toLowerCase()));
  const activeHubs = hubs.length ? hubs : DEFAULT_HUBS;

  const xml = await client.fetchFmiXml({ places, startTime: start, endTime: end, timestepMinutes: 60 });
  const stationRows = parseFmiSimpleXml(xml, activeHubs);

  if (mode === 'station_weather') {
    const attr = dualAttribution();
    return stationRows.map((r) => ({
      recordType: 'station_weather',
      ...r,
      hourStartHelsinki: helsinkiTime(r.hourStartUtc),
      fmiStoredQueryId: FMI_STORED_QUERY,
      modified: false,
      retrievedAt,
      ...attr,
    }));
  }

  if (mode === 'joined_nowcast') {
    const fgRows = await client.fetchFingridTimeseries([245, 248, 166, 75], { startTime: start, endTime: end });
    return buildJoinedNowcast(stationRows, fgRows, {
      hubs: activeHubs,
      topN,
      includeStationBreakdown,
      retrievedAt,
    });
  }

  throw new Error(`Unknown mode "${mode}". Supported modes: joined_nowcast, station_weather`);
}

export { HttpError };
