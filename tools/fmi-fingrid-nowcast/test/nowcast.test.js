import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  parseFmiSimpleXml,
  aggregateWeatherByHour,
  buildJoinedNowcast,
  createNowcastClient,
  runNowcast,
  dualAttribution,
  MissingApiKeyError,
  DEFAULT_HUBS,
} from '../src/lib/nowcast.js';
import { licences } from '../src/lib/common.js';

const dir = path.dirname(fileURLToPath(import.meta.url));

const SAMPLE_FMI_XML = `<?xml version="1.0" encoding="UTF-8"?>
<wfs:FeatureCollection xmlns:wfs="http://www.opengis.net/wfs/2.0" xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:BsWfs="http://xml.fmi.fi/schema/wfs/2.0">
  <wfs:member>
    <BsWfs:BsWfsElement gml:id="e1">
      <BsWfs:Location><gml:Point><gml:pos>65.01236 25.46816 </gml:pos></gml:Point></BsWfs:Location>
      <BsWfs:Time>2026-10-27T12:00:00Z</BsWfs:Time>
      <BsWfs:ParameterName>Temperature</BsWfs:ParameterName>
      <BsWfs:ParameterValue>4.5</BsWfs:ParameterValue>
    </BsWfs:BsWfsElement>
  </wfs:member>
  <wfs:member>
    <BsWfs:BsWfsElement gml:id="e2">
      <BsWfs:Location><gml:Point><gml:pos>65.01236 25.46816 </gml:pos></gml:Point></BsWfs:Location>
      <BsWfs:Time>2026-10-27T12:00:00Z</BsWfs:Time>
      <BsWfs:ParameterName>WindSpeedMS</BsWfs:ParameterName>
      <BsWfs:ParameterValue>11.2</BsWfs:ParameterValue>
    </BsWfs:BsWfsElement>
  </wfs:member>
  <wfs:member>
    <BsWfs:BsWfsElement gml:id="e3">
      <BsWfs:Location><gml:Point><gml:pos>65.01236 25.46816 </gml:pos></gml:Point></BsWfs:Location>
      <BsWfs:Time>2026-10-27T12:00:00Z</BsWfs:Time>
      <BsWfs:ParameterName>HourlyMaximumGust</BsWfs:ParameterName>
      <BsWfs:ParameterValue>16.8</BsWfs:ParameterValue>
    </BsWfs:BsWfsElement>
  </wfs:member>
  <wfs:member>
    <BsWfs:BsWfsElement gml:id="e4">
      <BsWfs:Location><gml:Point><gml:pos>60.16952 24.93545 </gml:pos></gml:Point></BsWfs:Location>
      <BsWfs:Time>2026-10-27T12:00:00Z</BsWfs:Time>
      <BsWfs:ParameterName>Temperature</BsWfs:ParameterName>
      <BsWfs:ParameterValue>8.0</BsWfs:ParameterValue>
    </BsWfs:BsWfsElement>
  </wfs:member>
  <wfs:member>
    <BsWfs:BsWfsElement gml:id="e5">
      <BsWfs:Location><gml:Point><gml:pos>60.16952 24.93545 </gml:pos></gml:Point></BsWfs:Location>
      <BsWfs:Time>2026-10-27T12:00:00Z</BsWfs:Time>
      <BsWfs:ParameterName>RadiationGlobal</BsWfs:ParameterName>
      <BsWfs:ParameterValue>185.4</BsWfs:ParameterValue>
    </BsWfs:BsWfsElement>
  </wfs:member>
  <wfs:member>
    <BsWfs:BsWfsElement gml:id="e6">
      <BsWfs:Location><gml:Point><gml:pos>65.01236 25.46816 </gml:pos></gml:Point></BsWfs:Location>
      <BsWfs:Time>2026-10-27T13:00:00Z</BsWfs:Time>
      <BsWfs:ParameterName>WindSpeedMS</BsWfs:ParameterName>
      <BsWfs:ParameterValue>14.0</BsWfs:ParameterValue>
    </BsWfs:BsWfsElement>
  </wfs:member>
  <wfs:member>
    <BsWfs:BsWfsElement gml:id="e7">
      <BsWfs:Location><gml:Point><gml:pos>65.01236 25.46816 </gml:pos></gml:Point></BsWfs:Location>
      <BsWfs:Time>2026-10-27T13:00:00Z</BsWfs:Time>
      <BsWfs:ParameterName>Temperature</BsWfs:ParameterName>
      <BsWfs:ParameterValue>4.0</BsWfs:ParameterValue>
    </BsWfs:BsWfsElement>
  </wfs:member>
</wfs:FeatureCollection>`;

const SAMPLE_FINGRID_ROWS = [
  { datasetId: 245, startTime: '2026-10-27T12:00:00Z', endTime: '2026-10-27T12:15:00Z', value: 3200 },
  { datasetId: 248, startTime: '2026-10-27T12:00:00Z', endTime: '2026-10-27T12:15:00Z', value: 150 },
  { datasetId: 166, startTime: '2026-10-27T12:00:00Z', endTime: '2026-10-27T12:15:00Z', value: 9500 },
  { datasetId: 75, startTime: '2026-10-27T12:00:00Z', endTime: '2026-10-27T12:15:00Z', value: 3280 },
  { datasetId: 245, startTime: '2026-10-27T13:00:00Z', endTime: '2026-10-27T13:15:00Z', value: 4100 },
  { datasetId: 248, startTime: '2026-10-27T13:00:00Z', endTime: '2026-10-27T13:15:00Z', value: 90 },
  { datasetId: 166, startTime: '2026-10-27T13:00:00Z', endTime: '2026-10-27T13:15:00Z', value: 9300 },
];

test('dualAttribution includes both exact Fingrid and FMI CC BY 4.0 attributions', () => {
  const attr = dualAttribution();
  const reg = licences().sources;
  assert.equal(attr.fingridAttribution, reg.fingrid.attribution);
  assert.ok(attr.fmiAttribution.includes('Ilmatieteen laitoksen avoin data'));
  assert.ok(attr.fmiAttribution.includes('Finnish Meteorological Institute open data'));
  assert.ok(attr.fmiAttribution.includes('CC BY 4.0'));
  assert.ok(attr.attribution.includes(reg.fingrid.attribution));
  assert.ok(attr.attribution.includes('Ilmatieteen laitoksen avoin data'));
});

test('parseFmiSimpleXml parses coordinates, maps hubs, and aggregates hourly weather', () => {
  const rows = parseFmiSimpleXml(SAMPLE_FMI_XML, DEFAULT_HUBS);
  assert.equal(rows.length, 3);
  const oulu12 = rows.find((r) => r.place === 'Oulu' && r.hourStartUtc === '2026-10-27T12:00:00.000Z');
  assert.ok(oulu12);
  assert.equal(oulu12.temperatureC, 4.5);
  assert.equal(oulu12.windSpeedMs, 11.2);
  assert.equal(oulu12.windGustMs, 16.8);

  const hel12 = rows.find((r) => r.place === 'Helsinki' && r.hourStartUtc === '2026-10-27T12:00:00.000Z');
  assert.ok(hel12);
  assert.equal(hel12.globalRadiationWm2, 185.4);

  const agg = aggregateWeatherByHour(rows, DEFAULT_HUBS);
  const h12 = agg.get('2026-10-27T12:00:00.000Z');
  assert.ok(h12);
  assert.equal(h12.fmiWindSpeedWeightedMs, 11.2);
  assert.equal(h12.fmiRadiationWeightedWm2, 185.4);
  assert.ok(h12.fmiHeatingDegreeHoursC > 0);
});

test('buildJoinedNowcast joins FMI weather with Fingrid forecasts, computes residual load, ramps, and dual attribution', () => {
  const fmiRows = parseFmiSimpleXml(SAMPLE_FMI_XML, DEFAULT_HUBS);
  const joined = buildJoinedNowcast(fmiRows, SAMPLE_FINGRID_ROWS, { topN: 1 });
  assert.equal(joined.length, 2);

  const [h12, h13] = joined;
  assert.equal(h12.hourStartHelsinki, '2026-10-27T14:00');
  assert.equal(h12.fingridWindForecastMW, 3200);
  assert.equal(h12.fingridSolarForecastMW, 150);
  assert.equal(h12.fingridConsumptionForecastMW, 9500);
  assert.equal(h12.residualLoadMW, 6150);
  assert.equal(h12.windForecastErrorMW, 80);
  assert.equal(h12.rank, 2);
  assert.equal(h12.isEvChargeRecommended, false);

  assert.equal(h13.residualLoadMW, 5110);
  assert.equal(h13.windRamp1hMW, 900);
  assert.equal(h13.residualRamp1hMW, -1040);
  assert.equal(h13.rank, 1);
  assert.equal(h13.isEvChargeRecommended, true);

  for (const r of joined) {
    assert.ok(r.attribution.includes('Source Fingrid / data.fingrid.fi, license CC 4.0 BY'));
    assert.ok(r.attribution.includes('Ilmatieteen laitoksen avoin data'));
    assert.equal(r.modified, true);
    assert.match(r.modificationNotice, /NO Nord Pool/i);
  }
});

test('runNowcast supports both joined_nowcast and station_weather and never leaks API key in URL', async () => {
  const calls = [];
  const fakeFetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).startsWith('https://opendata.fmi.fi/wfs')) {
      return new Response(SAMPLE_FMI_XML, { status: 200, headers: { 'content-type': 'application/xml' } });
    }
    if (String(url).startsWith('https://data.fingrid.fi/api/data')) {
      return new Response(JSON.stringify({ data: SAMPLE_FINGRID_ROWS, pagination: { nextPage: null } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('not found', { status: 404 });
  };

  const client = createNowcastClient({
    fingridApiKey: 'SECRET_TEST_KEY',
    fetchImpl: fakeFetch,
    fingridMinIntervalMs: 0,
    fmiMinIntervalMs: 0,
  });

  const joined = await runNowcast({ mode: 'joined_nowcast', client, now: new Date('2026-10-27T12:00:00Z') });
  assert.equal(joined.length, 2);
  assert.ok(calls.every((c) => !c.url.includes('SECRET_TEST_KEY')), 'API key must never appear in request URL');
  const fgCall = calls.find((c) => c.url.includes('data.fingrid.fi'));
  assert.equal(fgCall.init.headers['x-api-key'], 'SECRET_TEST_KEY');

  const stationOnly = await runNowcast({ mode: 'station_weather', client, now: new Date('2026-10-27T12:00:00Z') });
  assert.equal(stationOnly.length, 3);
  assert.ok(stationOnly.every((r) => r.attribution.includes('Source Fingrid') && r.attribution.includes('Ilmatieteen laitoksen avoin data')));

  const noKeyClient = createNowcastClient({ fingridApiKey: '', fetchImpl: fakeFetch, fingridMinIntervalMs: 0, fmiMinIntervalMs: 0 });
  await assert.rejects(runNowcast({ mode: 'joined_nowcast', client: noKeyClient }), MissingApiKeyError);
});

test('no Nord Pool or ENTSO-E day-ahead price endpoints appear anywhere in code', () => {
  const srcDir = path.join(dir, '..', 'src');
  for (const rel of ['main.js', 'mcp-server.js', 'lib/nowcast.js', 'lib/common.js']) {
    const code = readFileSync(path.join(srcDir, rel), 'utf8').replace(/\/\/.*$/gm, '');
    assert.ok(!/nordpool(group)?\.com|elspot|entsoe\.eu.*A44/i.test(code), rel);
  }
});

test('MCP server lists tools and includes dual attribution on both success and error responses', async () => {
  const transport = new StdioClientTransport({
    command: 'node',
    args: [path.join(dir, '..', 'src', 'mcp-server.js')],
    env: { ...process.env, FINGRID_API_KEY: '' },
  });
  const mcpClient = new Client({ name: 'nowcast-test-client', version: '0.1.0' });
  await mcpClient.connect(transport);
  try {
    const { tools } = await mcpClient.listTools();
    const names = tools.map((t) => t.name);
    assert.ok(names.includes('fmi_fingrid_nowcast'));
    assert.ok(names.includes('fmi_station_weather'));
    assert.ok(names.includes('fmi_fingrid_licence_info'));

    const errRes = await mcpClient.callTool({ name: 'fmi_fingrid_nowcast', arguments: { hoursBack: 2, hoursAhead: 4 } });
    assert.equal(errRes.isError, true);
    const errBody = JSON.parse(errRes.content[0].text);
    assert.ok(errBody.attribution.includes('Source Fingrid / data.fingrid.fi, license CC 4.0 BY'));
    assert.ok(errBody.attribution.includes('Ilmatieteen laitoksen avoin data'));

    const licRes = await mcpClient.callTool({ name: 'fmi_fingrid_licence_info', arguments: {} });
    const licBody = JSON.parse(licRes.content[0].text);
    assert.ok(licBody.register.fingrid);
    assert.ok(licBody.register.fmi);
  } finally {
    await mcpClient.close();
  }
});
