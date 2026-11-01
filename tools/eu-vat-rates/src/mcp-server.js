#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createTedbClient, tedbAttribution } from './lib/tedb.js';
import { jsonResult, errorResult } from './lib/mcp-util.js';

const server = new McpServer({ name: 'eu-vat-rates', version: '0.2.0' });
const client = createTedbClient();
const countries = z.array(z.string().length(2)).max(28).optional()
  .describe('EU member states, ISO alpha-2 (Greece = EL or GR, Northern Ireland = XI). Omit for all 27.');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Situation date YYYY-MM-DD (default today). Historic dates supported.');

server.tool(
  'eu_vat_standard_rates',
  'Official EU VAT rates per member state on a given date from the European Commission Taxes in Europe Database (TEDB): standard rate, reduced, super-reduced and parking rates, regional standard rates (e.g. Canary Islands entries) and the categories with reduced rates. Source data is supplied by Member States (CC BY 4.0).',
  { countries, date },
  async (args) => {
    try {
      return jsonResult('eu_tedb', await client.standardRates(args), tedbAttribution());
    } catch (err) {
      return errorResult('eu_tedb', err);
    }
  }
);

server.tool(
  'eu_vat_rates_lookup',
  'Find the VAT rate that applies to specific goods or services in EU member states, by Combined Nomenclature (CN) code (e.g. 4901 books), CPA code, or TEDB category id (e.g. FOODSTUFFS, PHARMACEUTICAL_PRODUCTS, ACCOMMODATION, RESTAURANT). Returns the matching reduced/exempt entries with comments, and the standard rate as fallback for countries without a specific entry.',
  {
    countries,
    date,
    cnCodes: z.array(z.string()).max(20).optional().describe('CN codes, e.g. ["4901", "2201 10"]'),
    cpaCodes: z.array(z.string()).max(20).optional().describe('CPA codes, e.g. ["55.10"]'),
    categories: z.array(z.string()).max(20).optional().describe('TEDB category identifiers, e.g. ["FOODSTUFFS"]'),
    limit: z.number().int().min(1).max(200).optional().default(50),
  },
  async (args) => {
    try {
      return jsonResult('eu_tedb', await client.lookup(args), tedbAttribution());
    } catch (err) {
      return errorResult('eu_tedb', err);
    }
  }
);

server.tool(
  'eu_vat_rates_licence_info',
  'Return the TEDB licence (CC BY 4.0), attribution string and the not-legally-binding disclaimer.',
  {},
  async () => jsonResult('eu_tedb', tedbAttribution())
);

await server.connect(new StdioServerTransport());
