// Core library: Fingrid grid & reserve signals. Shared by the Apify actor and the MCP server.
// Data source: Fingrid Open Data API (https://data.fingrid.fi/api), CC BY 4.0. Requires a free API key (x-api-key header).
// IMPORTANT: no electricity exchange (Nord Pool / day-ahead) prices are used anywhere. The cheap-hour signal is derived from
// Fingrid forecasts of wind, solar and consumption only.
import { attributionFor, createLimiter, fetchJson, HttpError } from './common.js';

export const API_BASE = 'https://data.fingrid.fi/api';
// Fingrid throttling: 10,000 requests / 24 h and ONE request every two seconds per key. We keep 2.1 s spacing.
const sharedLimiter = createLimiter(2100);

/** Curated Fingrid-produced datasets (ids/names/units verified from data.fingrid.fi dataset pages, 2026-10-11). */
export const DATASETS = {
  193: { key: 'consumption_rt', name: 'Electricity consumption in Finland - real-time data', unit: 'MW' },
  124: { key: 'consumption', name: 'Electricity consumption in Finland', unit: 'MWh/h' },
  165: { key: 'consumption_forecast_daily', name: 'Electricity consumption forecast - updated once a day', unit: 'MW' },
  166: { key: 'consumption_forecast', name: 'Electricity consumption forecast - updated every 15 minutes', unit: 'MW' },
  192: { key: 'production_rt', name: 'Electricity production in Finland - real-time data', unit: 'MW' },
  74: { key: 'production', name: 'Electricity production in Finland', unit: 'MWh/h' },
  181: { key: 'wind_rt', name: 'Wind power production - real-time data', unit: 'MW' },
  75: { key: 'wind_15min', name: 'Wind power generation - 15 min data', unit: 'MW' },
  245: { key: 'wind_forecast', name: 'Wind power generation forecast - updated every 15 minutes', unit: 'MWh/h' },
  248: { key: 'solar_forecast', name: 'Solar power generation forecast - updated every 15 minutes', unit: 'MWh/h' },
  247: { key: 'solar_forecast_daily', name: 'Solar power generation forecast - updated once a day', unit: 'MWh/h' },
  188: { key: 'nuclear_rt', name: 'Nuclear power production - real-time data', unit: 'MW' },
  191: { key: 'hydro_rt', name: 'Hydro power production - real-time data', unit: 'MW' },
  194: { key: 'net_import_rt', name: 'Net import/export of electricity - real-time data', unit: 'MW' },
  177: { key: 'frequency_rt', name: 'Frequency - real-time data', unit: 'Hz' },
  209: { key: 'system_state_rt', name: 'Power system state - real-time data', unit: 'no' },
  336: { key: 'shortage_status', name: 'Electricity shortage status', unit: '0-3' },
  317: { key: 'fcrn_price', name: 'Frequency Containment Reserve for Normal operation, hourly market prices', unit: 'EUR/MW' },
  318: { key: 'fcrd_up_price', name: 'Frequency Containment Reserve for Disturbances upwards regulation, hourly market prices', unit: 'EUR/MW' },
  283: { key: 'fcrd_down_price', name: 'Frequency Containment Reserve for Disturbances downwards regulation, hourly market prices', unit: 'EUR/MW' },
  52: { key: 'afrr_up_price', name: 'Automatic Frequency Restoration Reserve, price, up', unit: 'EUR/MW' },
  51: { key: 'afrr_down_price', name: 'Automatic Frequency Restoration Reserve, price, down', unit: 'EUR/MW' },
  329: { key: 'mfrr_up_capacity_price', name: 'Balancing Capacity Market (mFRR), up, hourly market, price', unit: 'EUR/MW' },
  330: { key: 'mfrr_down_capacity_price', name: 'Balancing Capacity (mFRR), down, hourly market, price', unit: 'EUR/MW' },
  277: { key: 'ffr_price', name: 'Fast Frequency Reserve FFR, price', unit: 'EUR/MW' },
  319: { key: 'imbalance_price', name: 'Imbalance price', unit: 'EUR/MWh' },
  397: { key: 'calculated_imbalance', name: 'Calculated imbalance', unit: 'MW' },
  244: { key: 'up_regulation_price', name: 'Up-regulating price in the Balancing energy market', unit: 'EUR/MWh' },
  106: { key: 'down_regulation_price', name: 'Down-regulation price in the Balancing energy market', unit: 'EUR/MWh' },
  396: { key: 'emission_factor_consumption', name: 'Emission factor for electricity consumed in Finland - updated every 15 minutes', unit: 'gCO2/kWh' },
  395: { key: 'non_fossil_share', name: 'Share of non-fossil electricity generation in Finland - updated every 15 minutes', unit: '%' },
};

export const GROUPS = {
  grid_snapshot: [193, 192, 181, 188, 191, 194, 177, 209, 336, 396, 395],
  consumption_production: [124, 74, 166, 193, 192],
  renewables: [181, 75, 245, 248],
  frequency: [177],
  reserves: [317, 318, 283, 52, 51, 329, 330, 277],
  imbalance: [319, 397, 244, 106],
  co2: [396, 395],
};

export function datasetUrl(id) { return `https://data.fingrid.fi/en/datasets/${id}`; }

export class MissingApiKeyError extends Error {
  constructor() { super('FINGRID_API_KEY is not set. Register free at https://data.fingrid.fi (developer portal, "Open Data starter") and set the key as env FINGRID_API_KEY / actor secret input.'); }
}

export function createClient({ apiKey = process.env.FINGRID_API_KEY, fetchImpl, minIntervalMs } = {}) {
  if (!apiKey) throw new MissingApiKeyError();
  // minIntervalMs override is for offline tests only; production always uses the shared 2.1 s limiter.
  const limiter = minIntervalMs !== undefined ? createLimiter(minIntervalMs) : sharedLimiter;
  const headers = { 'x-api-key': apiKey }; // header only, never in the URL (Fingrid instruction)
  const get = (pathAndQuery) => fetchJson(`${API_BASE}${pathAndQuery}`, { headers, fetchImpl, limiter });
  return {
    /** Multi-dataset time series in one request (saves the 1 req / 2 s budget). Follows pagination. */
    async timeseries(ids, { startTime, endTime, pageSize = 20000, maxPages = 10 } = {}) {
      const rows = [];
      for (let page = 1; page <= maxPages; page++) {
        const qs = new URLSearchParams({ datasets: ids.join(','), format: 'json', pageSize: String(pageSize), page: String(page), sortBy: 'startTime', sortOrder: 'asc' });
        if (startTime) qs.set('startTime', new Date(startTime).toISOString());
        if (endTime) qs.set('endTime', new Date(endTime).toISOString());
        const res = await get(`/data?${qs}`);
        rows.push(...(res?.data || []));
        if (!res?.pagination?.nextPage) break;
      }
      return rows;
    },
    async datasetMeta(id) { return get(`/datasets/${Number(id)}`); },
    async health() { return get('/health'); },
  };
}

export function toRecord(row, { retrievedAt = new Date().toISOString() } = {}) {
  const d = DATASETS[row.datasetId] || {};
  return {
    datasetId: row.datasetId,
    dataset: d.name || null,
    seriesKey: d.key || null,
    unit: d.unit || null,
    startTime: row.startTime,
    endTime: row.endTime,
    value: row.value,
    sourceUrl: datasetUrl(row.datasetId),
    modified: false,
    retrievedAt,
    ...attributionFor('fingrid'),
  };
}

/** Latest observation per dataset. */
export function latestPerDataset(rows) {
  const m = new Map();
  for (const r of rows) {
    const p = m.get(r.datasetId);
    if (!p || r.startTime > p.startTime) m.set(r.datasetId, r);
  }
  return [...m.values()].sort((a, b) => a.datasetId - b.datasetId);
}

const HEL = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Helsinki', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
export const helsinkiTime = (iso) => HEL.format(new Date(iso)).replace(' ', 'T');

function hourlyMeans(rows, id) {
  const m = new Map();
  for (const r of rows) {
    if (r.datasetId !== id || typeof r.value !== 'number') continue;
    const h = new Date(r.startTime); h.setUTCMinutes(0, 0, 0);
    const k = h.toISOString();
    const e = m.get(k) || { sum: 0, n: 0 };
    e.sum += r.value; e.n++; m.set(k, e);
  }
  return new Map([...m].map(([k, e]) => [k, e.sum / e.n]));
}

const DERIVED_NOTICE = (ids) => `Modified: derived by Open-Data Tool Factory from Fingrid open data datasets ${ids.join(', ')} (${ids.map(datasetUrl).join(', ')}) - hourly averages, residual load and ranking. Not a price forecast; uses no electricity exchange price data.`;

/**
 * "Cheap / low-carbon hour" signal from Fingrid FORECASTS only:
 * residual load = consumption forecast (166) - wind forecast (245) - solar forecast (248), hourly.
 * Lower residual load => more of demand covered by wind+solar => typically lower-carbon and lower-price hours.
 * Returns one record per future hour, ranked (1 = best).
 */
export function cheapHourSignal(rows, { topN = 6, now = new Date(), retrievedAt = new Date().toISOString() } = {}) {
  const cons = hourlyMeans(rows, 166), wind = hourlyMeans(rows, 245), solar = hourlyMeans(rows, 248);
  const nowHour = new Date(now); nowHour.setUTCMinutes(0, 0, 0);
  const hours = [...cons.keys()].filter((h) => wind.has(h) && new Date(h) >= nowHour).sort();
  const items = hours.map((h) => {
    const c = cons.get(h), w = wind.get(h), s = solar.get(h) ?? 0;
    return { h, c, w, s, residual: c - w - s, share: c > 0 ? (w + s) / c : null };
  });
  const sorted = [...items].sort((a, b) => a.residual - b.residual);
  const rank = new Map(sorted.map((it, i) => [it.h, i + 1]));
  const min = sorted[0]?.residual ?? 0, max = sorted.at(-1)?.residual ?? 0;
  return items.map((it) => ({
    signal: 'cheap_low_carbon_hour',
    hourStartUtc: it.h,
    hourStartHelsinki: helsinkiTime(it.h),
    consumptionForecastMW: round(it.c),
    windForecastMW: round(it.w),
    solarForecastMW: round(it.s),
    residualLoadMW: round(it.residual),
    windSolarSharePct: it.share === null ? null : round(it.share * 100, 1),
    rank: rank.get(it.h),
    score: max === min ? 100 : round((100 * (max - it.residual)) / (max - min), 0),
    isCheapHourCandidate: rank.get(it.h) <= topN,
    basisDatasets: [166, 245, 248],
    modified: true,
    modificationNotice: DERIVED_NOTICE([166, 245, 248]),
    retrievedAt,
    ...attributionFor('fingrid'),
  }));
}

/** CO2 summary from Fingrid's own emission factor (396) and non-fossil share (395). */
export function co2Signal(rows, { retrievedAt = new Date().toISOString() } = {}) {
  const ef = rows.filter((r) => r.datasetId === 396 && typeof r.value === 'number').sort((a, b) => a.startTime.localeCompare(b.startTime));
  if (!ef.length) return null;
  const vals = ef.map((r) => r.value).sort((a, b) => a - b);
  const q = (p) => vals[Math.min(vals.length - 1, Math.floor(p * (vals.length - 1)))];
  const cur = ef.at(-1);
  const nf = rows.filter((r) => r.datasetId === 395).sort((a, b) => a.startTime.localeCompare(b.startTime)).at(-1);
  return {
    signal: 'co2_intensity',
    latestStartTime: cur.startTime,
    latestHelsinki: helsinkiTime(cur.startTime),
    emissionFactorGPerKWh: cur.value,
    nonFossilSharePct: nf?.value ?? null,
    windowMin: vals[0], windowMedian: q(0.5), windowMax: vals.at(-1), windowP25: q(0.25),
    windowStart: ef[0].startTime,
    observations: ef.length,
    isLowCarbonNow: cur.value <= q(0.25),
    level: cur.value <= q(0.25) ? 'low' : cur.value >= q(0.75) ? 'high' : 'medium',
    basisDatasets: [396, 395],
    modified: true,
    modificationNotice: DERIVED_NOTICE([396, 395]).replace('hourly averages, residual load and ranking', 'window statistics and low/medium/high classification'),
    retrievedAt,
    ...attributionFor('fingrid'),
  };
}
const round = (x, d = 1) => (x === null || x === undefined ? null : Math.round(x * 10 ** d) / 10 ** d);

/** High-level operations shared by actor and MCP. */
export async function runMode(mode, { client, hoursBack = 24, hoursAhead = 36, datasetIds = [], topN = 6, now = new Date() } = {}) {
  const retrievedAt = new Date().toISOString();
  const H = 3600e3;
  if (mode === 'grid_snapshot') {
    const rows = await client.timeseries(GROUPS.grid_snapshot, { startTime: new Date(now - H), endTime: now });
    return latestPerDataset(rows).map((r) => toRecord(r, { retrievedAt }));
  }
  if (mode === 'cheap_hours') {
    const rows = await client.timeseries([166, 245, 248], { startTime: now, endTime: new Date(+now + hoursAhead * H) });
    return cheapHourSignal(rows, { topN, now, retrievedAt });
  }
  if (mode === 'co2') {
    const rows = await client.timeseries(GROUPS.co2, { startTime: new Date(now - hoursBack * H), endTime: now });
    const s = co2Signal(rows, { retrievedAt });
    return s ? [s] : [];
  }
  if (mode === 'custom') {
    for (const id of datasetIds) {
      if (DATASETS[id]) continue;
      // Only Fingrid-produced CC BY datasets are allowed (other organisations' datasets may carry other licences).
      const meta = await client.datasetMeta(id);
      const lic = meta?.license?.name || '';
      if (meta?.organization !== 'Fingrid' || !/Creative Commons Attribution/i.test(lic)) throw new Error(`Dataset ${id} is not a Fingrid CC BY dataset (organization=${meta?.organization}, licence=${lic}); refused by licence register`);
      DATASETS[id] = { key: `dataset_${id}`, name: meta.nameEn, unit: meta.unitEn };
    }
  }
  const ids = mode === 'custom' ? datasetIds : GROUPS[mode];
  if (!ids?.length) throw new Error(`Unknown mode "${mode}". Modes: ${[...Object.keys(GROUPS), 'cheap_hours', 'co2', 'custom'].join(', ')}`);
  const rows = await client.timeseries(ids, { startTime: new Date(now - hoursBack * H), endTime: now });
  return rows.map((r) => toRecord(r, { retrievedAt }));
}

export { HttpError };
