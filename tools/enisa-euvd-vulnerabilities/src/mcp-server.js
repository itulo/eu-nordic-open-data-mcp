#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createEuvdClient, euvdAttribution } from './lib/euvd.js';
import { jsonResult, errorResult } from './lib/mcp-util.js';

const server = new McpServer({
  name: 'enisa-euvd-vulnerabilities',
  version: '0.1.0',
});

const client = createEuvdClient();

server.tool(
  'euvd_exploited_and_critical',
  'Fetch the latest actively exploited (KEV) and critical CVSS vulnerabilities from the EU ENISA European Vulnerability Database (EUVD).',
  {
    feed: z.enum(['exploited', 'critical', 'latest']).optional().default('exploited'),
  },
  async ({ feed }) => {
    try {
      let items;
      if (feed === 'critical') items = await client.fetchCriticalVulnerabilities();
      else if (feed === 'latest') items = await client.fetchLatestVulnerabilities();
      else items = await client.fetchExploitedVulnerabilities();
      return jsonResult('enisa_euvd', { feed, count: items.length, items }, euvdAttribution());
    } catch (err) {
      return errorResult('enisa_euvd', err);
    }
  }
);

server.tool(
  'euvd_search_vulnerabilities',
  'Search the EU ENISA European Vulnerability Database (EUVD) by keyword, vendor, product, CVSS score range, EPSS score range, or exploited status.',
  {
    text: z.string().optional().default(''),
    vendor: z.string().optional().default(''),
    product: z.string().optional().default(''),
    fromScore: z.number().min(0).max(10).optional(),
    toScore: z.number().min(0).max(10).optional(),
    fromEpss: z.number().min(0).max(100).optional(),
    exploited: z.boolean().optional(),
    size: z.number().int().min(1).max(100).optional().default(20),
  },
  async (args) => {
    try {
      const res = await client.searchVulnerabilities(args);
      return jsonResult('enisa_euvd', res, euvdAttribution());
    } catch (err) {
      return errorResult('enisa_euvd', err);
    }
  }
);

server.tool(
  'euvd_lookup_by_id',
  'Look up a specific CVE ID (e.g. CVE-2024-3400) or EUVD ID (e.g. EUVD-2026-107265) in the ENISA European Vulnerability Database.',
  {
    id: z.string().min(3),
  },
  async ({ id }) => {
    try {
      const record = await client.lookupById(id);
      return jsonResult('enisa_euvd', { record }, euvdAttribution());
    } catch (err) {
      return errorResult('enisa_euvd', err);
    }
  }
);

server.tool(
  'euvd_licence_info',
  'Return ENISA European Vulnerability Database (EUVD) reuse policy and attribution metadata.',
  {},
  async () => jsonResult('enisa_euvd', euvdAttribution())
);

const transport = new StdioServerTransport();
await server.connect(transport);
