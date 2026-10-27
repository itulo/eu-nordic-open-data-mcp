#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  createEcbClient,
  convertInvoicesWithEcbRates,
  ecbAttribution,
  DEFAULT_CURRENCIES,
  DEFAULT_INFLATION_AREAS,
} from './lib/ecb.js';
import { jsonResult, errorResult } from './lib/mcp-util.js';

const server = new McpServer({
  name: 'ecb-fx-rates-macro',
  version: '0.1.0',
});

const client = createEcbClient();

server.tool(
  'ecb_fx_rates',
  'Fetch official European Central Bank (ECB) daily & historical EUR reference exchange rates via SDMX 2.1.',
  {
    currencies: z.array(z.string()).optional().default(DEFAULT_CURRENCIES),
    lastNObservations: z.number().int().min(1).max(365).optional().default(5),
    startPeriod: z.string().optional(),
    endPeriod: z.string().optional(),
  },
  async (args) => {
    try {
      const rates = await client.fetchFxRates(args);
      return jsonResult('ecb', { count: rates.length, rates }, ecbAttribution());
    } catch (err) {
      return errorResult('ecb', err);
    }
  }
);

server.tool(
  'ecb_policy_rates_and_inflation',
  'Fetch official Eurosystem key policy interest rates (DFR, MRR_FR, MLFR) and Euro Area / EU country HICP annual inflation rates.',
  {
    inflationAreas: z.array(z.string()).optional().default(DEFAULT_INFLATION_AREAS),
    lastNObservations: z.number().int().min(1).max(60).optional().default(3),
  },
  async ({ inflationAreas, lastNObservations }) => {
    try {
      const policyRates = await client.fetchPolicyRates({ lastNObservations });
      const hicpInflation = await client.fetchHicpInflation({ areas: inflationAreas, lastNObservations });
      return jsonResult('ecb', { policyRates, hicpInflation }, ecbAttribution());
    } catch (err) {
      return errorResult('ecb', err);
    }
  }
);

server.tool(
  'ecb_convert_invoices',
  'Convert B2B invoice amounts across currencies using official ECB EUR reference rates with prior-business-day fallback.',
  {
    invoices: z.array(z.object({
      invoiceId: z.string().optional(),
      amount: z.number(),
      fromCurrency: z.string(),
      toCurrency: z.string().optional().default('EUR'),
      date: z.string().optional(),
    })).min(1).max(100),
  },
  async ({ invoices }) => {
    try {
      const curs = new Set(['USD', 'GBP', 'SEK', 'NOK', 'CHF']);
      for (const i of invoices) {
        curs.add(String(i.fromCurrency).toUpperCase());
        curs.add(String(i.toCurrency || 'EUR').toUpperCase());
      }
      const fx = await client.fetchFxRates({ currencies: [...curs], lastNObservations: 30 });
      const conversions = convertInvoicesWithEcbRates(invoices, fx);
      return jsonResult('ecb', { count: conversions.length, conversions }, ecbAttribution({ modified: true }));
    } catch (err) {
      return errorResult('ecb', err);
    }
  }
);

server.tool(
  'ecb_licence_info',
  'Return European Central Bank (ESCB) statistics reuse policy and attribution metadata.',
  {},
  async () => jsonResult('ecb', ecbAttribution())
);

const transport = new StdioServerTransport();
await server.connect(transport);
