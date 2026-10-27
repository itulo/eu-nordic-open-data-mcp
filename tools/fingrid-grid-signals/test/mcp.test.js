import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('MCP server lists tools; without key returns a clear error with attribution', async () => {
  const env = { ...process.env }; delete env.FINGRID_API_KEY;
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'src/mcp-server.js')], env }));
  try {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), ['fingrid_cheap_hours', 'fingrid_co2_intensity', 'fingrid_dataset', 'fingrid_grid_snapshot', 'fingrid_licence_info', 'fingrid_series']);
    const lic = JSON.parse((await client.callTool({ name: 'fingrid_licence_info', arguments: {} })).content[0].text);
    assert.equal(lic.attribution, 'Source Fingrid / data.fingrid.fi, license CC 4.0 BY');
    const r = await client.callTool({ name: 'fingrid_grid_snapshot', arguments: {} });
    assert.equal(r.isError, true);
    const body = JSON.parse(r.content[0].text);
    assert.match(body.error, /FINGRID_API_KEY/);
    assert.equal(body.attribution, 'Source Fingrid / data.fingrid.fi, license CC 4.0 BY');
  } finally { await client.close(); }
});
