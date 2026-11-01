#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createSafetyGateClient, safetyGateAttribution } from './lib/safetygate.js';
import { jsonResult, errorResult } from './lib/mcp-util.js';

const server = new McpServer({ name: 'eu-safety-gate-alerts', version: '0.2.0' });
const client = createSafetyGateClient();

server.tool(
  'eu_safety_gate_alerts',
  'List EU Safety Gate (formerly RAPEX) alerts on dangerous non-food consumer products from the latest official weekly reports (published every Friday by the European Commission, CC0). Filter by notifying country, country of origin, product category, risk type (e.g. Chemical, Choking, Electric shock), risk level or free text. Each alert has brand, model, barcodes, risk, measures (recall, withdrawal, marketplace delisting), marketplace listing ids and a link to the official alert.',
  {
    weeks: z.number().int().min(1).max(12).optional().default(1).describe('How many latest weekly reports to scan (1 = latest week)'),
    notifyingCountry: z.string().optional().describe('e.g. Finland, Germany'),
    countryOfOrigin: z.string().optional().describe("e.g. China (matches \"People's Republic of China\")"),
    category: z.string().optional().describe('e.g. Toys, Cosmetics, Electrical appliances'),
    riskType: z.string().optional().describe('e.g. Chemical, Choking, Injuries, Fire'),
    riskLevel: z.string().optional().describe('e.g. Serious'),
    query: z.string().optional().describe('Free text over product, brand, name, model, description'),
    fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Only reports published on/after this date'),
    limit: z.number().int().min(1).max(500).optional().default(50),
  },
  async (args) => {
    try {
      return jsonResult('safety_gate', await client.alerts(args), safetyGateAttribution());
    } catch (err) {
      return errorResult('safety_gate', err);
    }
  }
);

server.tool(
  'eu_safety_gate_match',
  'Check a product catalogue against EU Safety Gate alerts: exact GTIN/EAN barcode match, marketplace listing id (e.g. Amazon ASIN) match, and brand + model fuzzy match, over the last N weekly reports. Returns only products that matched, with match type, score and the alert. Use for marketplace / retailer compliance screening.',
  {
    products: z.array(z.object({
      gtin: z.union([z.string(), z.array(z.string())]).optional().describe('GTIN/EAN/UPC barcode(s)'),
      brand: z.string().optional(),
      model: z.string().optional().describe('Model / type number'),
      name: z.string().optional().describe('Product name (used with brand when no model)'),
      listingId: z.union([z.string(), z.array(z.string())]).optional().describe('Marketplace listing id, e.g. ASIN'),
      sku: z.string().optional().describe('Your own reference, echoed back'),
    })).min(1).max(500),
    weeks: z.number().int().min(1).max(52).optional().default(8).describe('Weekly reports to scan (1 request each, cached)'),
  },
  async (args) => {
    try {
      return jsonResult('safety_gate', await client.match(args), safetyGateAttribution());
    } catch (err) {
      return errorResult('safety_gate', err);
    }
  }
);

server.tool(
  'eu_safety_gate_reports',
  'List the latest Safety Gate weekly reports (reference, publication date, week, XML URL).',
  { limit: z.number().int().min(1).max(100).optional().default(10) },
  async ({ limit }) => {
    try {
      return jsonResult('safety_gate', { reports: await client.reports(limit) }, safetyGateAttribution());
    } catch (err) {
      return errorResult('safety_gate', err);
    }
  }
);

server.tool(
  'eu_safety_gate_licence_info',
  'Return the Safety Gate weekly-report licence (CC0 1.0), attribution and disclaimer.',
  {},
  async () => jsonResult('safety_gate', safetyGateAttribution())
);

await server.connect(new StdioServerTransport());
