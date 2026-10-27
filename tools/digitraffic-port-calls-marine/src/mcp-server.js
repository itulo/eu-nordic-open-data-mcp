#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createDigitrafficClient, digitrafficAttribution } from './lib/digitraffic.js';
import { jsonResult, errorResult } from './lib/mcp-util.js';

const server = new McpServer({
  name: 'digitraffic-port-calls-marine',
  version: '0.1.0',
});

const client = createDigitrafficClient();

server.tool(
  'digitraffic_port_calls',
  'Fetch live and scheduled Baltic & Finnish vessel port calls (ETA, ETD, ATA, ATD, berth, IMO, cargo status, shipping agents) from Fintraffic Digitraffic Marine API (CC BY 4.0).',
  {
    ports: z.array(z.string()).optional().default(['FIHEL', 'FITKU', 'FIHKO', 'FIKTK']),
    cargoOnly: z.boolean().optional().default(false),
    vesselQuery: z.string().optional().default(''),
    maxResults: z.number().int().min(1).max(200).optional().default(25),
  },
  async (args) => {
    try {
      const portCalls = await client.getPortCalls(args);
      return jsonResult('digitraffic', { count: portCalls.length, portCalls }, digitrafficAttribution());
    } catch (err) {
      return errorResult('digitraffic', err);
    }
  }
);

server.tool(
  'digitraffic_port_congestion_summary',
  'Aggregate port call traffic, cargo share, active berths, and average vessel turnaround time across Finnish ports (CC BY 4.0).',
  {
    ports: z.array(z.string()).optional().default([]),
    cargoOnly: z.boolean().optional().default(false),
  },
  async (args) => {
    try {
      const summary = await client.getPortCongestionSummary(args);
      return jsonResult('digitraffic', { count: summary.length, ports: summary }, digitrafficAttribution());
    } catch (err) {
      return errorResult('digitraffic', err);
    }
  }
);

server.tool(
  'digitraffic_licence_info',
  'Return Fintraffic Digitraffic CC BY 4.0 open-data licence and attribution metadata.',
  {},
  async () => jsonResult('digitraffic', digitrafficAttribution())
);

const transport = new StdioServerTransport();
await server.connect(transport);
