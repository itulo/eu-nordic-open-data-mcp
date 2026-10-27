// Core library for European Central Bank (ECB) SDMX 2.1 Data Portal:
// - Official daily & historical EUR reference exchange rates (EXR)
// - Official Eurosystem key policy interest rates (FM: DFR, MRR_FR, MLFR)
// - Official Euro Area & EU country HICP annual inflation rates (ICP)
// - B2B Invoice & Cross-Currency Converter using official ECB reference rates
import { attributionFor, createLimiter, fetchJson } from './common.js';

export const ECB_API_BASE = 'https://data-api.ecb.europa.eu/service/data';

export const DEFAULT_CURRENCIES = ['USD', 'GBP', 'SEK', 'NOK', 'DKK', 'CHF', 'JPY', 'PLN', 'CAD', 'AUD'];
export const DEFAULT_INFLATION_AREAS = ['U2', 'FI', 'DE', 'FR', 'NL', 'SE'];

export function ecbAttribution(extra = {}) {
  return {
    ...attributionFor('ecb'),
    sourceUrl: 'https://data.ecb.europa.eu',
    ...extra,
  };
}

/**
 * Universal parser for ECB SDMX-JSON (`format=jsondata`) responses.
 * Returns flat array of { dimensions: { [dimId]: { id, name } }, period, periodName, value }.
 */
export function parseSdmxJson(sdmx) {
  const dataSet = sdmx?.dataSets?.[0];
  const seriesDims = sdmx?.structure?.dimensions?.series || [];
  const obsDims = sdmx?.structure?.dimensions?.observation || [];
  const timeDim = obsDims[0] || { id: 'TIME_PERIOD', values: [] };
  if (!dataSet || !dataSet.series) return [];

  const rows = [];
  for (const [seriesKey, seriesObj] of Object.entries(dataSet.series)) {
    const idxParts = seriesKey.split(':').map(Number);
    const dims = {};
    for (let i = 0; i < seriesDims.length; i++) {
      const d = seriesDims[i];
      const valObj = d.values?.[idxParts[i]] || { id: String(idxParts[i]), name: String(idxParts[i]) };
      dims[d.id] = { id: valObj.id, name: valObj.name };
    }

    const observations = seriesObj.observations || {};
    for (const [obsIdxStr, obsArr] of Object.entries(observations)) {
      const obsIdx = Number(obsIdxStr);
      const tObj = timeDim.values?.[obsIdx] || { id: obsIdxStr, name: obsIdxStr };
      const val = Array.isArray(obsArr) ? Number(obsArr[0]) : Number(obsArr);
      if (!Number.isFinite(val)) continue;
      rows.push({
        dimensions: dims,
        period: tObj.id,
        periodName: tObj.name || tObj.id,
        value: val,
      });
    }
  }
  return rows;
}

/**
 * Convert an array of invoice objects using a map of currency -> [{ period, rate }].
 * Supports cross-rates (e.g. USD -> SEK via EUR) and prior-business-day fallback on weekends/holidays.
 */
export function convertInvoicesWithEcbRates(invoices = [], fxRecords = []) {
  const attr = ecbAttribution({
    modified: true,
    modificationNotice: 'Derived currency conversion computed from official unmodified ECB EUR reference exchange rates.',
  });

  // Group fxRecords by currency sorted ascending by date
  const byCurrency = new Map();
  for (const r of fxRecords) {
    const c = String(r.currency || '').toUpperCase();
    if (!c) continue;
    if (!byCurrency.has(c)) byCurrency.set(c, []);
    byCurrency.get(c).push({ date: r.period, rate: Number(r.ratePerEur) });
  }
  for (const list of byCurrency.values()) {
    list.sort((a, b) => a.date.localeCompare(b.date));
  }

  function lookupEurRate(currency, targetDate) {
    const cur = String(currency || 'EUR').toUpperCase();
    if (cur === 'EUR') return { ratePerEur: 1.0, rateDate: targetDate || 'EUR-FIXED' };
    const list = byCurrency.get(cur);
    if (!list || !list.length) {
      throw new Error(`No ECB reference rate available for currency ${cur}`);
    }
    if (!targetDate) {
      const latest = list[list.length - 1];
      return { ratePerEur: latest.rate, rateDate: latest.date };
    }
    // Find latest observation on or before targetDate (fallback to earliest if targetDate precedes window)
    let chosen = list[0];
    for (const item of list) {
      if (item.date <= targetDate) chosen = item;
      else break;
    }
    return { ratePerEur: chosen.rate, rateDate: chosen.date };
  }

  return invoices.map((inv, idx) => {
    const invoiceId = inv.invoiceId || `INV-${idx + 1}`;
    const amount = Number(inv.amount ?? 0);
    const fromCurrency = String(inv.fromCurrency || 'USD').toUpperCase();
    const toCurrency = String(inv.toCurrency || 'EUR').toUpperCase();
    const requestedDate = inv.date || null;

    const fromInfo = lookupEurRate(fromCurrency, requestedDate);
    const toInfo = lookupEurRate(toCurrency, requestedDate);

    const amountInEur = amount / fromInfo.ratePerEur;
    const convertedAmount = amountInEur * toInfo.ratePerEur;
    const effectiveRate = toInfo.ratePerEur / fromInfo.ratePerEur;

    return {
      recordType: 'ecb_invoice_conversion',
      invoiceId,
      originalAmount: amount,
      fromCurrency,
      toCurrency,
      convertedAmount: Number(convertedAmount.toFixed(4)),
      amountInEur: Number(amountInEur.toFixed(4)),
      effectiveCrossRate: Number(effectiveRate.toFixed(6)),
      fromRatePerEur: fromInfo.ratePerEur,
      toRatePerEur: toInfo.ratePerEur,
      requestedDate,
      ecbRateDateUsed: fromCurrency === 'EUR' ? toInfo.rateDate : fromInfo.rateDate,
      ...attr,
    };
  });
}

export function createEcbClient({ fetchImpl = globalThis.fetch, minIntervalMs = 300 } = {}) {
  const limiter = createLimiter(minIntervalMs);

  return {
    async fetchFxRates({ currencies = DEFAULT_CURRENCIES, lastNObservations = 5, startPeriod, endPeriod } = {}) {
      const cleanCurrencies = currencies
        .map((c) => String(c).trim().toUpperCase())
        .filter((c) => c && c !== 'EUR');
      const key = `D.${cleanCurrencies.join('+')}.EUR.SP00.A`;
      const params = new URLSearchParams({ format: 'jsondata' });
      if (lastNObservations) params.set('lastNObservations', String(lastNObservations));
      if (startPeriod) params.set('startPeriod', startPeriod);
      if (endPeriod) params.set('endPeriod', endPeriod);

      const url = `${ECB_API_BASE}/EXR/${key}?${params.toString()}`;
      const sdmx = await fetchJson(url, {
        fetchImpl,
        limiter,
        userAgent: 'open-data-tool-factory/0.1 (+ecb-fx-rates-macro)',
      });
      const attr = ecbAttribution();
      const parsed = parseSdmxJson(sdmx);
      return parsed
        .map((r) => {
          const currency = r.dimensions.CURRENCY?.id || null;
          const currencyName = r.dimensions.CURRENCY?.name || currency;
          const ratePerEur = r.value;
          return {
            recordType: 'ecb_fx_rate',
            baseCurrency: 'EUR',
            currency,
            currencyName,
            period: r.period,
            ratePerEur,
            inverseEurPerUnit: ratePerEur > 0 ? Number((1 / ratePerEur).toFixed(6)) : null,
            ...attr,
          };
        })
        .sort((a, b) => b.period.localeCompare(a.period) || String(a.currency).localeCompare(String(b.currency)));
    },

    async fetchPolicyRates({ lastNObservations = 5 } = {}) {
      const key = 'B.U2.EUR.4F.KR.DFR+MRR_FR+MLFR.LEV';
      const url = `${ECB_API_BASE}/FM/${key}?lastNObservations=${encodeURIComponent(String(lastNObservations))}&format=jsondata`;
      const sdmx = await fetchJson(url, {
        fetchImpl,
        limiter,
        userAgent: 'open-data-tool-factory/0.1 (+ecb-fx-rates-macro)',
      });
      const attr = ecbAttribution();
      const parsed = parseSdmxJson(sdmx);
      return parsed
        .map((r) => ({
          recordType: 'ecb_policy_rate',
          rateCode: r.dimensions.PROVIDER_FM_ID?.id || null,
          rateName: r.dimensions.PROVIDER_FM_ID?.name || null,
          period: r.period,
          ratePct: r.value,
          ...attr,
        }))
        .sort((a, b) => b.period.localeCompare(a.period) || String(a.rateCode).localeCompare(String(b.rateCode)));
    },

    async fetchHicpInflation({ areas = DEFAULT_INFLATION_AREAS, lastNObservations = 3 } = {}) {
      const cleanAreas = areas.map((a) => String(a).trim().toUpperCase()).filter(Boolean);
      const key = `M.${cleanAreas.join('+')}.N.000000.4.ANR`;
      const url = `${ECB_API_BASE}/ICP/${key}?lastNObservations=${encodeURIComponent(String(lastNObservations))}&format=jsondata`;
      const sdmx = await fetchJson(url, {
        fetchImpl,
        limiter,
        userAgent: 'open-data-tool-factory/0.1 (+ecb-fx-rates-macro)',
      });
      const attr = ecbAttribution();
      const parsed = parseSdmxJson(sdmx);
      return parsed
        .map((r) => ({
          recordType: 'ecb_hicp_inflation',
          areaCode: r.dimensions.REF_AREA?.id || null,
          areaName: r.dimensions.REF_AREA?.name || null,
          period: r.period,
          annualInflationPct: r.value,
          ...attr,
        }))
        .sort((a, b) => b.period.localeCompare(a.period) || String(a.areaCode).localeCompare(String(b.areaCode)));
    },
  };
}
