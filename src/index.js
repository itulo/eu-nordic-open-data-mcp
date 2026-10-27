#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const unifiedServer = new McpServer({
  name: 'eu-nordic-open-data-mcp',
  version: '0.1.0',
});

const origRegisterTool = McpServer.prototype.registerTool;
const origTool = McpServer.prototype.tool;
const origConnect = McpServer.prototype.connect;

McpServer.prototype.registerTool = function (name, config, cb) {
  return origRegisterTool.call(unifiedServer, name, config, cb);
};

McpServer.prototype.tool = function (...args) {
  return origTool.apply(unifiedServer, args);
};

McpServer.prototype.connect = async function () {
  // Prevent individual sub-servers from attaching to stdio when imported by the unified server
};

const modules = [
  '../tools/ted-tender-feed/src/mcp-server.js',
  '../tools/prh-company-events/src/mcp-server.js',
  '../tools/fingrid-grid-signals/src/mcp-server.js',
  '../tools/fmi-fingrid-nowcast/src/mcp-server.js',
  '../tools/fmi-weather-warnings-alerts/src/mcp-server.js',
  '../tools/eu-vies-vat-validator/src/mcp-server.js',
  '../tools/ecb-fx-rates-macro/src/mcp-server.js',
  '../tools/digitraffic-port-calls-marine/src/mcp-server.js',
  '../tools/enisa-euvd-vulnerabilities/src/mcp-server.js',
];

for (const modPath of modules) {
  await import(modPath);
}

const sanctionsMod = await import('../tools/eu-sanctions-screen/src/mcp-server.js');
if (typeof sanctionsMod.buildServer === 'function') {
  sanctionsMod.buildServer();
}

McpServer.prototype.registerTool = origRegisterTool;
McpServer.prototype.tool = origTool;
McpServer.prototype.connect = origConnect;

await unifiedServer.connect(new StdioServerTransport());
