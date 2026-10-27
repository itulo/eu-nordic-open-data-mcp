import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCapAtomXml, parseWfsSimpleObservations, createFmiAlertsClient, fmiAlertsAttribution } from '../src/lib/fmi-alerts.js';

const SAMPLE_CAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>urn:oid:2.49.0.1.246.0.0.2026.1</id>
    <title>Orange wind warning: Sea of Bothnia</title>
    <updated>2026-10-27T12:00:00Z</updated>
    <content type="text/xml">
      <alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">
        <identifier>urn:oid:2.49.0.1.246.0.0.2026.1</identifier>
        <sent>2026-10-27T14:00:00+02:00</sent>
        <status>Actual</status>
        <msgType>Alert</msgType>
        <info>
          <language>en-GB</language>
          <event>Wind warning for sea areas</event>
          <urgency>Future</urgency>
          <severity>Severe</severity>
          <certainty>Likely</certainty>
          <eventCode><valueName>profile:cap</valueName><value>seaWind</value></eventCode>
          <onset>2026-10-27T15:00:00+02:00</onset>
          <expires>2026-10-28T06:00:00+02:00</expires>
          <headline>Orange wind warning for sea areas: Sea of Bothnia</headline>
          <description>Northwesterly gale 22 m/s.</description>
          <parameter><valueName>color</valueName><value>orange</value></parameter>
          <parameter><valueName>probability</valueName><value>60</value></parameter>
          <parameter><valueName>typicalImpacts</valueName><value>High waves and spray.</value></parameter>
          <area><areaDesc>Sea of Bothnia</areaDesc></area>
        </info>
      </alert>
    </content>
  </entry>
  <entry>
    <id>urn:oid:2.49.0.1.246.0.0.2026.2</id>
    <title>REMOVED: Yellow wave height warning</title>
    <content type="text/xml">
      <alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">
        <identifier>urn:oid:2.49.0.1.246.0.0.2026.2</identifier>
        <status>Actual</status>
        <msgType>Cancel</msgType>
        <info>
          <language>en-GB</language>
          <event>Wave height warning</event>
          <severity>Moderate</severity>
          <headline>REMOVED: Yellow wave height warning</headline>
          <area><areaDesc>Northern Baltic</areaDesc></area>
        </info>
      </alert>
    </content>
  </entry>
</feed>`;

const SAMPLE_OBS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<wfs:FeatureCollection xmlns:wfs="http://www.opengis.net/wfs/2.0" xmlns:BsWfs="http://xml.fmi.fi/schema/wfs/2.0" xmlns:gml="http://www.opengis.net/gml/3.2">
  <wfs:member>
    <BsWfs:BsWfsElement>
      <BsWfs:Location><gml:Point><gml:pos>60.17523 24.94459</gml:pos></gml:Point></BsWfs:Location>
      <BsWfs:Time>2026-10-27T13:00:00Z</BsWfs:Time>
      <BsWfs:ParameterName>t2m</BsWfs:ParameterName>
      <BsWfs:ParameterValue>11.4</BsWfs:ParameterValue>
    </BsWfs:BsWfsElement>
  </wfs:member>
  <wfs:member>
    <BsWfs:BsWfsElement>
      <BsWfs:Location><gml:Point><gml:pos>60.17523 24.94459</gml:pos></gml:Point></BsWfs:Location>
      <BsWfs:Time>2026-10-27T13:00:00Z</BsWfs:Time>
      <BsWfs:ParameterName>ws_10min</BsWfs:ParameterName>
      <BsWfs:ParameterValue>8.2</BsWfs:ParameterValue>
    </BsWfs:BsWfsElement>
  </wfs:member>
</wfs:FeatureCollection>`;

test('1. parseCapAtomXml parses active alerts and skips Cancel messages by default', () => {
  const alerts = parseCapAtomXml(SAMPLE_CAP_XML, { language: 'en-GB', includeCancelled: false });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].eventCode, 'seaWind');
  assert.equal(alerts[0].severity, 'Severe');
  assert.equal(alerts[0].color, 'orange');
  assert.equal(alerts[0].probabilityPct, 60);
  assert.equal(alerts[0].isGridOrMarineRisk, true);
  assert.ok(alerts[0].attribution.includes('Ilmatieteen laitoksen avoin data'));
});

test('2. parseCapAtomXml filters by minSeverity and regionFilter', () => {
  const extremeOnly = parseCapAtomXml(SAMPLE_CAP_XML, { minSeverity: 'Extreme' });
  assert.equal(extremeOnly.length, 0);
  const regionMatch = parseCapAtomXml(SAMPLE_CAP_XML, { regionFilter: 'bothnia' });
  assert.equal(regionMatch.length, 1);
});

test('3. parseCapAtomXml includes cancelled when includeCancelled=true', () => {
  const all = parseCapAtomXml(SAMPLE_CAP_XML, { includeCancelled: true });
  assert.equal(all.length, 2);
});

test('4. parseWfsSimpleObservations extracts synoptic weather metrics and attribution', () => {
  const rows = parseWfsSimpleObservations(SAMPLE_OBS_XML, { place: 'Helsinki', recordType: 'weather_observation' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].place, 'Helsinki');
  assert.equal(rows[0].temperatureC, 11.4);
  assert.equal(rows[0].windSpeedMs, 8.2);
  assert.ok(rows[0].attribution.includes('CC BY 4.0'));
});

test('5. createFmiAlertsClient works with injected fetchImpl', async () => {
  const client = createFmiAlertsClient({
    minIntervalMs: 1,
    fetchImpl: async (url) => {
      if (String(url).includes('alerts.fmi.fi')) return new Response(SAMPLE_CAP_XML, { status: 200 });
      return new Response(SAMPLE_OBS_XML, { status: 200 });
    },
  });
  const alerts = await client.fetchActiveAlerts();
  assert.equal(alerts.length, 1);
  const obs = await client.fetchWeatherObservations({ places: ['Helsinki'] });
  assert.equal(obs.length, 1);
});

test('6. fmiAlertsAttribution carries exact CC BY 4.0 dataset pattern', () => {
  const attr = fmiAlertsAttribution();
  assert.ok(attr.attribution.includes('Ilmatieteen laitoksen avoin data'));
  assert.ok(attr.licenceUrl.includes('creativecommons.org/licenses/by/4.0'));
});
