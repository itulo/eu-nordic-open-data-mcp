#!/usr/bin/env node
// MCP server (stdio): FMI Weather + Fingrid Wind/Solar/Consumption Joined Nowcast Feature Feed.
// Shares src/lib/nowcast.js with the Apify actor. Every response (including errors) carries dual CC BY 4.0 attribution.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createNowcastClient, runNowcast, dualAttribution, DEFAULT_HUBS } from './lib/nowcast.js';
import { licences } from './lib/common.js';

const server = new McpServer({ name: 'fmi-fingrid-nowcast', version: '0.1.0' });
let client;
const getClient = () => (client ||= createNowcastClient());

function dualJsonResult(payload) {
  const body = { ...dualAttribution(), ...payload };
  return { content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] };
}

function dualErrorResult(err) {
  const body = { error: String(err?.message || err), ...dualAttribution() };
  return { isError: true, content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] };
}

server.registerTool(
  'fmi_fingrid_nowcast',
  {
    title: 'FMI Weather + Fingrid Wind/Solar/Consumption Nowcast Feed',
    description:
      'Hourly joined feature feed combining FMI meteorological forecasts (wind speed, gusts, global solar radiation, cloud cover, temperature, heating degree hours across Finnish wind/solar/demand hubs) with Fingrid wind, solar, and electricity consumption forecasts and actuals. Includes 1h wind/residual ramps, storm cut-out flags, and EV smart-charging rankings. Uses NO Nord Pool or ENTSO-E day-ahead prices.',
    inputSchema: {
      places: z.array(z.string()).min(1).max(10).default(DEFAULT_HUBS.map((h) => h.name)),
      hoursBack: z.number().int().min(0).max(72).default(6),
      hoursAhead: z.number().int().min(1).max(72).default(36),
      topN: z.number().int().min(1).max(24).default(6),
      includeStationBreakdown: z.boolean().default(false),
    },
  },
  async (args) => {
    try {
      const records = await runNowcast({ mode: 'joined_nowcast', client: getClient(), ...args });
      return dualJsonResult({ returned: records.length, records });
    } catch (e) {
      return dualErrorResult(e);
    }
  }
);

server.registerTool(
  'fmi_station_weather',
  {
    title: 'FMI Finnish Energy Hub Weather Forecast (WFS)',
    description:
      'Hourly FMI WFS weather forecast (temperature, wind speed, maximum wind gusts, wind direction, cloud cover, global radiation) for Finnish wind/solar/demand hubs (Oulu, Vaasa, Pori, Helsinki, Lappeenranta). Does not require a Fingrid API key.',
    inputSchema: {
      places: z.array(z.string()).min(1).max(10).default(DEFAULT_HUBS.map((h) => h.name)),
      hoursBack: z.number().int().min(0).max(72).default(3),
      hoursAhead: z.number().int().min(1).max(72).default(24),
    },
  },
  async (args) => {
    try {
      const records = await runNowcast({ mode: 'station_weather', client: getClient(), ...args });
      return dualJsonResult({ returned: records.length, records });
    } catch (e) {
      return dualErrorResult(e);
    }
  }
);

server.registerTool(
  'fmi_fingrid_licence_info',
  {
    title: 'Licence and dual attribution for FMI + Fingrid nowcast feed',
    description: 'Returns CC BY 4.0 licence details, required attributions, and rate limits for both FMI and Fingrid.',
    inputSchema: {},
  },
  async () => {
    const src = licences().sources;
    return dualJsonResult({
      register: {
        fingrid: src.fingrid,
        fmi: src.fmi,
      },
    });
  }
);

await server.connect(new StdioServerTransport());
