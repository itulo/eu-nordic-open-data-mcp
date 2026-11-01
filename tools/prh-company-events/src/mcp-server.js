#!/usr/bin/env node
// MCP server (stdio): PRH/YTJ company events. Shares src/lib/prh.js with the Apify actor. Company-level data only.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { fetchEvents, watchCompanies, defaultWindow, EVENT_TYPES, DEFAULT_EVENTS } from './lib/prh.js';
import { fetchEventsNo, lookupNo, NO_SUPPORTED, NO_DEFAULT_EVENTS } from './lib/brreg.js';
import { jsonResult, errorResult, stateFile } from './lib/mcp-util.js';
import { licences } from './lib/common.js';

const server = new McpServer({ name: 'prh-company-events', version: '0.2.0' });
const NOTE = 'Company-level data only. Person data (representatives, c/o names, street addresses) is not provided.';

server.registerTool('prh_company_events', {
  title: 'Finnish company events (PRH Trade Register)',
  description: `New companies, name changes, liquidations, bankruptcies, restructurings, dissolutions and industry changes registered in a date window. Event types: ${Object.keys(EVENT_TYPES).filter((k) => !['company_form_change', 'situation_change', 'location_change', 'status_change'].includes(k)).join(', ')}. ${NOTE}`,
  inputSchema: {
    eventTypes: z.array(z.string()).default(DEFAULT_EVENTS),
    dateFrom: z.string().optional().describe('YYYY-MM-DD, default yesterday'),
    dateTo: z.string().optional().describe('YYYY-MM-DD, default yesterday'),
    location: z.string().optional().describe('Town/city of registered office, e.g. Helsinki'),
    companyForm: z.string().optional().describe('PRH company form code, e.g. OY, OYJ, OK, KY, AY'),
    maxPerEvent: z.number().int().min(1).max(500).default(100),
  },
}, async (a) => {
  try {
    const win = a.dateFrom && a.dateTo ? { dateFrom: a.dateFrom, dateTo: a.dateTo } : defaultWindow({});
    const r = await fetchEvents({ ...a, ...win });
    return jsonResult('prh', { note: NOTE, window: win, stats: r.stats, returned: r.records.length, records: r.records });
  } catch (e) { return errorResult('prh', e); }
});

server.registerTool('prh_watch_companies', {
  title: 'Watch Finnish companies for changes',
  description: `Checks Business IDs against the last snapshot (kept locally per watchName) and reports name, industry, form, situation, location and status changes. ${NOTE}`,
  inputSchema: { businessIds: z.array(z.string()).min(1).max(100), watchName: z.string().default('default') },
}, async ({ businessIds, watchName }) => {
  try {
    const sf = stateFile(`prh-watch-${watchName.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
    const w = await watchCompanies(businessIds, sf.read());
    sf.write(w.snapshots);
    return jsonResult('prh', { note: NOTE, changes: w.records, firstSeen: w.firstSeen, notFound: w.notFound });
  } catch (e) { return errorResult('prh', e); }
});

const NO_NOTE = 'Company-level data only: sole proprietorships (ENK) are withheld; no roles/persons, no street addresses, e-mail or phone. Source: Brreg Enhetsregisteret (NLOD 2.0).';
server.registerTool('brreg_company_events', {
  title: 'Norwegian company events (Brreg Enhetsregisteret)',
  description: `Norway: new companies, name changes, liquidations, bankruptcies, compulsory dissolutions, removals, registered-office (municipality) changes and industry changes in a date window, from the Brønnøysund Register Centre's open API and update feed. Event types: ${NO_SUPPORTED.join(', ')}. Same record shape as prh_company_events. ${NO_NOTE}`,
  inputSchema: {
    eventTypes: z.array(z.enum(NO_SUPPORTED)).default(NO_DEFAULT_EVENTS),
    dateFrom: z.string().optional().describe('YYYY-MM-DD, default yesterday'),
    dateTo: z.string().optional().describe('YYYY-MM-DD, default yesterday'),
    location: z.string().optional().describe('Town (poststed, e.g. OSLO) or 4-digit kommunenummer'),
    companyForm: z.string().optional().describe('Brreg organisasjonsform code, e.g. AS, ASA, NUF, SA'),
    maxPerEvent: z.number().int().min(1).max(500).default(100),
  },
}, async (a) => {
  try {
    const win = a.dateFrom && a.dateTo ? { dateFrom: a.dateFrom, dateTo: a.dateTo } : defaultWindow({});
    const r = await fetchEventsNo({ ...a, ...win });
    return jsonResult('brreg', { note: NO_NOTE, window: win, stats: r.stats, returned: r.records.length, records: r.records });
  } catch (e) { return errorResult('brreg', e); }
});

server.registerTool('brreg_company_lookup', {
  title: 'Norwegian company lookup (Brreg)',
  description: `Company-level profile for a Norwegian organisation number (9 digits; 'NO 123 456 789 MVA' accepted): name, legal form, NACE code, municipality, status, bankruptcy/liquidation flags. ${NO_NOTE}`,
  inputSchema: { orgNumber: z.string().describe('9-digit organisasjonsnummer') },
}, async ({ orgNumber }) => {
  try { return jsonResult('brreg', await lookupNo(orgNumber)); } catch (e) { return errorResult('brreg', e); }
});

server.registerTool('prh_licence_info', { title: 'Licence and attribution for PRH data', description: 'Licence, attribution, restrictions (no PRH/YTJ logos, no look-alike UI, GDPR).', inputSchema: {} },
  async () => jsonResult('prh', { register: licences().sources.prh }));

await server.connect(new StdioServerTransport());
