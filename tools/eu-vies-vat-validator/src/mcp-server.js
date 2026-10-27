#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createViesClient, viesAttribution } from './lib/vies.js';
import { jsonResult, errorResult } from './lib/mcp-util.js';

const server = new McpServer({
  name: 'eu-vies-vat-validator',
  version: '0.1.0',
});

const client = createViesClient();

server.tool(
  'vies_validate_vat_batch',
  'Validate one or more EU/XI VAT numbers against the official European Commission VIES REST API with B2B reverse-charge eligibility and automatic GDPR sole-trader personal data redaction.',
  {
    vatNumbers: z.array(z.string()).min(1).max(100),
    supplierCountryCode: z.string().optional().default('FI'),
  },
  async ({ vatNumbers, supplierCountryCode }) => {
    try {
      const results = await client.validateBatch(vatNumbers, { supplierCountryCode });
      return jsonResult('eu_vies', { count: results.length, results }, viesAttribution());
    } catch (err) {
      return errorResult('eu_vies', err);
    }
  }
);

server.tool(
  'vies_member_state_status',
  'Check real-time availability of all 28 EU + Northern Ireland (XI) national VAT databases connected to the European Commission VIES gateway.',
  {},
  async () => {
    try {
      const status = await client.checkMemberStatesStatus();
      return jsonResult('eu_vies', status, viesAttribution());
    } catch (err) {
      return errorResult('eu_vies', err);
    }
  }
);

server.tool(
  'vies_licence_info',
  'Return European Commission VIES reuse policy, GDPR company-level safeguard details, and attribution metadata.',
  {},
  async () => jsonResult('eu_vies', viesAttribution())
);

const transport = new StdioServerTransport();
await server.connect(transport);
