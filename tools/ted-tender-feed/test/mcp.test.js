// Spawns the MCP server over stdio and checks tool listing + licence tool (offline).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('MCP server lists tools and returns attribution', async () => {
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'src/mcp-server.js')] }));
  try {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), ['ted_licence_info', 'ted_new_tenders_alert', 'ted_search_tenders']);
    const res = await client.callTool({ name: 'ted_licence_info', arguments: {} });
    const body = JSON.parse(res.content[0].text);
    assert.match(body.attribution, /TED/);
    const bad = await client.callTool({ name: 'ted_search_tenders', arguments: { cpvCodes: ['12'] } });
    assert.equal(bad.isError, true);
    assert.match(JSON.parse(bad.content[0].text).attribution, /TED/);
  } finally { await client.close(); }
});
