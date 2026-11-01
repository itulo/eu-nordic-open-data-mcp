#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createGleifClient, gleifAttribution } from './lib/gleif.js';
import { jsonResult, errorResult } from './lib/mcp-util.js';

const server = new McpServer({ name: 'gleif-lei-lookup', version: '0.2.0' });
const client = createGleifClient();

server.tool(
  'gleif_lei_lookup',
  'Look up one or more Legal Entity Identifiers (LEI, ISO 17442) in the official GLEIF database (CC0): legal name, legal form, jurisdiction, registered and HQ address, national register id, entity and registration status, renewal date and managing LOU. Validates LEI check digits. Sole-proprietor (natural person) records are withheld.',
  { leis: z.array(z.string()).min(1).max(100).describe('LEI codes, 20 characters each, e.g. 549300A0JPRWG1KI7U06 (Nokia Oyj)') },
  async ({ leis }) => {
    try {
      const results = leis.length === 1 ? [await client.lookup(leis[0])] : await client.lookupMany(leis);
      return jsonResult('gleif', { count: results.length, results }, gleifAttribution());
    } catch (err) {
      return errorResult('gleif', err);
    }
  }
);

server.tool(
  'gleif_search',
  'Search GLEIF LEI records by company name (legal or other names) and/or national business register number (e.g. Finnish Y-tunnus 0112038-9, UK company number, French SIREN). Filter by legal-address country (ISO 3166 alpha-2) and entity status. Returns company-level records with LEI.',
  {
    name: z.string().min(2).optional().describe('Company name or part of it'),
    registeredAs: z.string().optional().describe('National register number as recorded at the business registry'),
    country: z.string().length(2).optional().describe('Legal-address country, ISO alpha-2, e.g. FI'),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    limit: z.number().int().min(1).max(50).optional().default(10),
  },
  async (args) => {
    try {
      return jsonResult('gleif', await client.search(args), gleifAttribution());
    } catch (err) {
      return errorResult('gleif', err);
    }
  }
);

server.tool(
  'gleif_ownership_chain',
  'Return the GLEIF Level 2 "who owns whom" data for an LEI: direct accounting-consolidation parent and ultimate parent (with names, relationship status, periods and corroboration), or the reporting exception explaining why a parent is not reported (e.g. NON_CONSOLIDATING, NATURAL_PERSONS), plus the number of direct children. Useful for KYB / UBO pre-checks at company level.',
  {
    lei: z.string().describe('LEI code (20 characters)'),
    includeChildrenCount: z.boolean().optional().default(true),
  },
  async ({ lei, includeChildrenCount }) => {
    try {
      return jsonResult('gleif', await client.ownership(lei, { includeChildrenCount }), gleifAttribution());
    } catch (err) {
      return errorResult('gleif', err);
    }
  }
);

server.tool(
  'gleif_licence_info',
  'Return the GLEIF data licence (CC0 1.0), terms URL, attribution string and the personal-data policy applied by these tools.',
  {},
  async () => jsonResult('gleif', gleifAttribution())
);

await server.connect(new StdioServerTransport());
