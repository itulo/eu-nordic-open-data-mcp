#!/usr/bin/env node
// MCP server (stdio) for the TED EU tender feed. Shares src/lib/ted.js with the Apify actor.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { searchTenders, filterNew, alertWindow, NOTICE_TYPE_GROUPS } from './lib/ted.js';
import { jsonResult, errorResult, stateFile } from './lib/mcp-util.js';
import { licences } from './lib/common.js';

const server = new McpServer({ name: 'ted-tender-feed', version: '0.1.0' });

const filterShape = {
  cpvCodes: z.array(z.string()).default([]).describe('CPV codes, 8 digits (e.g. "72000000" IT services). Hierarchical: parent codes match children.'),
  countries: z.array(z.string()).default([]).describe('Country codes, ISO alpha-2 (FI) or alpha-3 (FIN)'),
  countryField: z.enum(['buyer', 'performance']).default('buyer').describe('Match buyer country or place of performance'),
  noticeTypes: z.array(z.string()).default(['competition']).describe(`Groups: ${Object.keys(NOTICE_TYPE_GROUPS).join(', ')}; or raw TED notice types like cn-standard`),
  language: z.string().default('eng').describe('Preferred title language, ISO 639-2/B, e.g. eng, fin, swe, deu'),
  maxResults: z.number().int().min(1).max(500).default(50),
  collapseByProcedure: z.boolean().default(false).describe('Keep only the latest notice per procedure'),
};

server.registerTool('ted_search_tenders', {
  title: 'Search EU public tenders (TED)',
  description: 'Search EU public procurement notices on TED by CPV code, country and publication date. Returns deduplicated, structured, organisation-level records with attribution.',
  inputSchema: { ...filterShape, publishedFrom: z.string().optional().describe('YYYY-MM-DD'), publishedTo: z.string().optional().describe('YYYY-MM-DD') },
}, async (args) => {
  try {
    const now = new Date();
    const a = { ...args };
    if (!a.publishedFrom && !a.publishedTo) a.publishedFrom = new Date(now.getTime() - 7 * 864e5).toISOString().slice(0, 10);
    const r = await searchTenders(a);
    return jsonResult('ted', { query: r.query, totalMatching: r.total, returned: r.records.length, records: r.records });
  } catch (e) { return errorResult('ted', e); }
});

server.registerTool('ted_new_tenders_alert', {
  title: 'New EU tenders since last check (alert)',
  description: 'Returns only TED notices not returned by a previous call with the same alertName (state kept in a local file).',
  inputSchema: { ...filterShape, alertName: z.string().default('default') },
}, async ({ alertName, ...args }) => {
  try {
    const sf = stateFile(`ted-alert-${alertName.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
    const state = sf.read();
    const r = await searchTenders({ ...args, ...alertWindow(state) });
    const { fresh, state: next } = filterNew(r.records, state);
    sf.write(next);
    return jsonResult('ted', { query: r.query, previousCheck: state.lastRunAt || null, newCount: fresh.length, records: fresh });
  } catch (e) { return errorResult('ted', e); }
});

server.registerTool('ted_licence_info', {
  title: 'Licence and attribution for TED data',
  description: 'Licence, attribution string, rate limits and restrictions for the TED data used by this server.',
  inputSchema: {},
}, async () => jsonResult('ted', { register: licences().sources.ted }));

await server.connect(new StdioServerTransport());
