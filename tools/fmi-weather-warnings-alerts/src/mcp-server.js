#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createFmiAlertsClient, fmiAlertsAttribution, DEFAULT_OBS_PLACES } from './lib/fmi-alerts.js';
import { jsonResult, errorResult } from './lib/mcp-util.js';

const server = new McpServer({
  name: 'fmi-weather-warnings-alerts',
  version: '0.1.0',
});

const client = createFmiAlertsClient();

server.tool(
  'fmi_active_alerts',
  'Fetch active Finnish Meteorological Institute (FMI) CAP 1.2 severe weather, marine, wave, wind, and traffic warnings across Finland and the Baltic Sea (CC BY 4.0).',
  {
    language: z.enum(['en-GB', 'fi-FI']).optional().default('en-GB'),
    minSeverity: z.enum(['Minor', 'Moderate', 'Severe', 'Extreme']).optional().default('Minor'),
    regionFilter: z.string().optional().default(''),
    includeCancelled: z.boolean().optional().default(false),
    maxAlerts: z.number().int().min(1).max(100).optional().default(25),
  },
  async (args) => {
    try {
      const alerts = await client.fetchActiveAlerts(args);
      return jsonResult('fmi', { count: alerts.length, alerts }, fmiAlertsAttribution());
    } catch (err) {
      return errorResult('fmi', err);
    }
  }
);

server.tool(
  'fmi_weather_observations',
  'Fetch live synoptic weather station observations (temperature, wind speed, gusts, humidity, precipitation, snow depth, pressure) for Finnish cities (CC BY 4.0).',
  {
    places: z.array(z.string()).optional().default(DEFAULT_OBS_PLACES),
    hoursBack: z.number().int().min(1).max(24).optional().default(2),
  },
  async (args) => {
    try {
      const observations = await client.fetchWeatherObservations(args);
      return jsonResult('fmi', { count: observations.length, observations }, fmiAlertsAttribution());
    } catch (err) {
      return errorResult('fmi', err);
    }
  }
);

server.tool(
  'fmi_sea_level_observations',
  'Fetch live Baltic Sea mareograph sea-level and water temperature observations along the Finnish coast (CC BY 4.0).',
  {
    hoursBack: z.number().int().min(1).max(24).optional().default(2),
    maxStations: z.number().int().min(1).max(25).optional().default(10),
  },
  async (args) => {
    try {
      const observations = await client.fetchSeaLevelObservations(args);
      return jsonResult('fmi', { count: observations.length, observations }, fmiAlertsAttribution());
    } catch (err) {
      return errorResult('fmi', err);
    }
  }
);

server.tool(
  'fmi_alerts_licence_info',
  'Return FMI CC BY 4.0 open-data licence and attribution metadata.',
  {},
  async () => jsonResult('fmi', fmiAlertsAttribution())
);

const transport = new StdioServerTransport();
await server.connect(transport);
