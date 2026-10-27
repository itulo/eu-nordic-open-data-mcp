#!/usr/bin/env node
// MCP server (stdio): PRH/YTJ company events. Shares src/lib/prh.js with the Apify actor. Company-level data only.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { fetchEvents, watchCompanies, defaultWindow, EVENT_TYPES, DEFAULT_EVENTS } from './lib/prh.js';
import { jsonResult, errorResult, stateFile } from './lib/mcp-util.js';
import { licences } from './lib/common.js';

const server = new McpServer({ name: 'prh-company-events', version: '0.1.0' });
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

server.registerTool('prh_licence_info', { title: 'Licence and attribution for PRH data', description: 'Licence, attribution, restrictions (no PRH/YTJ logos, no look-alike UI, GDPR).', inputSchema: {} },
  async () => jsonResult('prh', { register: licences().sources.prh }));

await server.connect(new StdioServerTransport());
