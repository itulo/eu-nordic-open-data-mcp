// Core library for Fintraffic Digitraffic Marine Port Calls & Baltic Port Congestion Intelligence.
// Licence: Creative Commons Attribution 4.0 International (CC BY 4.0).
// Exact required attribution: "Source: Fintraffic / digitraffic.fi, license CC 4.0 BY"
// Strictly vessel/company/port-level only: strips shipMasterArrival, shipMasterDeparture, and freeText fields (GDPR).
import { attributionFor, createLimiter, fetchJson } from './common.js';

export const DIGITRAFFIC_PORT_CALLS_URL = 'https://meri.digitraffic.fi/api/port-call/v1/port-calls';

export const FINNISH_PORT_NAMES = {
  FIHEL: 'Port of Helsinki',
  FITKU: 'Port of Turku',
  FIHKO: 'Port of Hanko',
  FIKTK: 'Port of Kotka',
  FIHAM: 'Port of HaminaKotka (Hamina)',
  FIRAU: 'Port of Rauma',
  FIPOR: 'Port of Pori',
  FIOUL: 'Port of Oulu',
  FINLI: 'Port of Naantali',
  FIKOK: 'Port of Kokkola',
  FIVAA: 'Port of Vaasa',
  FIMHQ: 'Port of Mariehamn',
  FILAN: 'Långnäs Port (Åland)',
  FIKEM: 'Port of Kemi',
  FITOR: 'Port of Tornio',
};

const CORPORATE_AGENT_RE = /\b(OY|OYJ|AB|AS|LTD|LIMITED|GMBH|SHIPPING|LINES|STEVE|LOGISTICS|PORT|AGENCY|AGENTS|CARGO|FORWARDING|MARITIME|SERVICES|CHARTERING|TERMINAL|GROUP)\b/i;

export function digitrafficAttribution(extra = {}) {
  return {
    ...attributionFor('digitraffic'),
    sourceUrl: 'https://www.digitraffic.fi/en/marine-traffic/',
    modified: true,
    modificationNotice: 'Normalized from Fintraffic Digitraffic Port Call v1 API; ship master personal fields stripped (GDPR) and berth turnaround / port congestion metrics computed.',
    ...extra,
  };
}

export function sanitizeAgentNames(agentInfo = []) {
  if (!Array.isArray(agentInfo)) return [];
  const names = new Set();
  for (const a of agentInfo) {
    const n = String(a?.name || '').trim();
    if (n && CORPORATE_AGENT_RE.test(n)) {
      names.add(n);
    }
  }
  return [...names];
}

/**
 * Normalize raw Digitraffic portCalls array into clean company/vessel-level records.
 */
export function normalizePortCalls(rawPayload, {
  ports = [],
  cargoOnly = false,
  vesselQuery = '',
  maxResults = 50,
} = {}) {
  const attr = digitrafficAttribution();
  const list = Array.isArray(rawPayload?.portCalls) ? rawPayload.portCalls : [];
  const portSet = new Set((ports || []).map((p) => String(p).trim().toUpperCase()).filter(Boolean));
  const q = String(vesselQuery || '').trim().toLowerCase();
  const out = [];

  for (const pc of list) {
    const portToVisit = String(pc.portToVisit || '').trim().toUpperCase();
    if (portSet.size > 0 && !portSet.has(portToVisit)) continue;
    if (cargoOnly && !pc.arrivalWithCargo) continue;

    const vesselName = String(pc.vesselName || '').trim();
    const imo = pc.imoLloyds ? Number(pc.imoLloyds) : null;
    if (q) {
      const matchVessel = vesselName.toLowerCase().includes(q)
        || String(imo || '').includes(q)
        || String(pc.radioCallSign || '').toLowerCase().includes(q);
      if (!matchVessel) continue;
    }

    const area = Array.isArray(pc.portAreaDetails) && pc.portAreaDetails.length ? pc.portAreaDetails[0] : {};
    const eta = area.eta || null;
    const etd = area.etd || null;
    const ata = area.ata && !String(area.ata).startsWith('2015-') ? area.ata : null;
    const atd = area.atd && !String(area.atd).startsWith('2015-') ? area.atd : null;

    let plannedTurnaroundHours = null;
    if (eta && etd) {
      const diffH = (Date.parse(etd) - Date.parse(eta)) / 3600_000;
      if (Number.isFinite(diffH) && diffH >= 0 && diffH <= 720) {
        plannedTurnaroundHours = Number(diffH.toFixed(2));
      }
    }

    out.push({
      recordType: 'port_call',
      portCallId: pc.portCallId,
      portCallTimestampUtc: pc.portCallTimestamp || null,
      portToVisit,
      portName: FINNISH_PORT_NAMES[portToVisit] || portToVisit,
      prevPort: pc.prevPort ? String(pc.prevPort).trim() : null,
      nextPort: pc.nextPort ? String(pc.nextPort).trim() : null,
      portAreaCode: area.portAreaCode || null,
      portAreaName: area.portAreaName || null,
      berthCode: area.berthCode || null,
      berthName: area.berthName || null,
      vesselName: vesselName || null,
      imoLloyds: imo && imo > 0 ? imo : null,
      mmsi: pc.mmsi && Number(pc.mmsi) > 0 ? Number(pc.mmsi) : null,
      radioCallSign: pc.radioCallSign || null,
      nationality: pc.nationality || null,
      vesselTypeCode: pc.vesselTypeCode ?? null,
      arrivalWithCargo: Boolean(pc.arrivalWithCargo),
      discharge: pc.discharge ?? null,
      etaUtc: eta,
      etdUtc: etd,
      ataUtc: ata,
      atdUtc: atd,
      plannedTurnaroundHours,
      shippingAgents: sanitizeAgentNames(pc.agentInfo),
      ...attr,
    });

    if (out.length >= maxResults) break;
  }

  return out;
}

/**
 * Aggregate normalized port calls into a per-port congestion and traffic summary.
 */
export function buildPortCongestionSummary(portCallRecords = []) {
  const attr = digitrafficAttribution();
  const byPort = new Map();

  for (const r of portCallRecords) {
    const p = r.portToVisit || 'UNKNOWN';
    if (!byPort.has(p)) {
      byPort.set(p, {
        portToVisit: p,
        portName: FINNISH_PORT_NAMES[p] || p,
        totalPortCalls: 0,
        cargoPortCalls: 0,
        turnaroundSum: 0,
        turnaroundCount: 0,
        berths: new Set(),
        nationalities: new Set(),
        vesselsSample: [],
      });
    }
    const g = byPort.get(p);
    g.totalPortCalls++;
    if (r.arrivalWithCargo) g.cargoPortCalls++;
    if (r.plannedTurnaroundHours !== null && Number.isFinite(r.plannedTurnaroundHours)) {
      g.turnaroundSum += r.plannedTurnaroundHours;
      g.turnaroundCount++;
    }
    if (r.berthName) g.berths.add(r.berthName);
    if (r.nationality) g.nationalities.add(r.nationality);
    if (r.vesselName && g.vesselsSample.length < 5 && !g.vesselsSample.includes(r.vesselName)) {
      g.vesselsSample.push(r.vesselName);
    }
  }

  return [...byPort.values()]
    .map((g) => ({
      recordType: 'port_congestion_summary',
      portToVisit: g.portToVisit,
      portName: g.portName,
      totalPortCalls: g.totalPortCalls,
      cargoPortCalls: g.cargoPortCalls,
      cargoSharePct: g.totalPortCalls > 0 ? Number(((g.cargoPortCalls / g.totalPortCalls) * 100).toFixed(1)) : 0,
      avgPlannedTurnaroundHours: g.turnaroundCount > 0 ? Number((g.turnaroundSum / g.turnaroundCount).toFixed(2)) : null,
      activeBerthsCount: g.berths.size,
      flagStatesCount: g.nationalities.size,
      vesselsSample: g.vesselsSample,
      ...attr,
    }))
    .sort((a, b) => b.totalPortCalls - a.totalPortCalls);
}

export function createDigitrafficClient({ fetchImpl = globalThis.fetch, minIntervalMs = 400 } = {}) {
  const limiter = createLimiter(minIntervalMs);

  return {
    async fetchRawPortCalls() {
      return fetchJson(DIGITRAFFIC_PORT_CALLS_URL, {
        fetchImpl,
        limiter,
        headers: {
          'Digitraffic-User': 'OpenDataFactory/1.0 (+digitraffic-port-calls-marine)',
          'Accept-Encoding': 'gzip',
        },
        userAgent: 'OpenDataFactory/1.0 (+digitraffic-port-calls-marine)',
      });
    },
    async getPortCalls(opts = {}) {
      const raw = await this.fetchRawPortCalls();
      return normalizePortCalls(raw, opts);
    },
    async getPortCongestionSummary(opts = {}) {
      const raw = await this.fetchRawPortCalls();
      const all = normalizePortCalls(raw, { ...opts, maxResults: 2000 });
      return buildPortCongestionSummary(all);
    },
  };
}
