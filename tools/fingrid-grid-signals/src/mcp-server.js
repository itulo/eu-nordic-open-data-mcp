#!/usr/bin/env node
// MCP server (stdio): Fingrid grid & reserve signals. Shares src/lib/fingrid.js with the Apify actor.
// Needs env FINGRID_API_KEY (free key from data.fingrid.fi). No exchange prices are used.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createClient, runMode, GROUPS, DATASETS } from './lib/fingrid.js';
import { jsonResult, errorResult } from './lib/mcp-util.js';
import { licences } from './lib/common.js';

const server = new McpServer({ name: 'fingrid-grid-signals', version: '0.1.0' });
let client;
const getClient = () => (client ||= createClient());

const tool = (name, title, description, inputSchema, mode) => server.registerTool(name, { title, description, inputSchema }, async (a) => {
  try {
    const records = await runMode(typeof mode === 'function' ? mode(a) : mode, { client: getClient(), ...a });
    return jsonResult('fingrid', { returned: records.length, records });
  } catch (e) { return errorResult('fingrid', e); }
});

tool('fingrid_grid_snapshot', 'Finnish power grid snapshot', 'Latest real-time Finnish consumption, production, wind, nuclear, hydro, net import, frequency, system state, shortage status, CO2 emission factor and non-fossil share (Fingrid).', {}, 'grid_snapshot');
tool('fingrid_cheap_hours', 'Cheap / low-carbon hours ahead (Finland)', 'Ranks the coming hours by residual load (consumption forecast minus wind and solar forecasts, all Fingrid). Lower = more renewable coverage, typically cheaper/cleaner. Heuristic, NOT a price forecast; no exchange prices used.', { hoursAhead: z.number().int().min(1).max(72).default(36), topN: z.number().int().min(1).max(24).default(6) }, 'cheap_hours');
tool('fingrid_co2_intensity', 'CO2 intensity of Finnish electricity', 'Current emission factor of electricity consumed in Finland (gCO2/kWh, Fingrid dataset 396) vs the recent window, plus non-fossil share.', { hoursBack: z.number().int().min(1).max(168).default(24) }, 'co2');
tool('fingrid_series', 'Fingrid time series by group', `Time series for a group: ${Object.keys(GROUPS).join(', ')} (reserves = FCR-N, FCR-D, aFRR, mFRR, FFR capacity prices; imbalance = imbalance price, calculated imbalance, balancing energy prices).`,
  { group: z.enum(Object.keys(GROUPS)), hoursBack: z.number().int().min(1).max(168).default(24) }, (a) => a.group);
tool('fingrid_dataset', 'Any Fingrid CC BY dataset', `Raw time series for given Fingrid dataset ids (Fingrid-produced CC BY datasets only). Curated ids: ${Object.keys(DATASETS).join(', ')}.`,
  { datasetIds: z.array(z.number().int()).min(1).max(20), hoursBack: z.number().int().min(1).max(168).default(24) }, 'custom');

server.registerTool('fingrid_licence_info', { title: 'Licence and attribution for Fingrid data', description: 'Licence, required attribution, rate limits.', inputSchema: {} },
  async () => jsonResult('fingrid', { register: licences().sources.fingrid }));

await server.connect(new StdioServerTransport());
