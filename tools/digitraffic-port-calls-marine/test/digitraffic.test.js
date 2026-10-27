import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePortCalls,
  buildPortCongestionSummary,
  sanitizeAgentNames,
  digitrafficAttribution,
} from '../src/lib/digitraffic.js';

const SAMPLE_RAW = {
  dataUpdatedTime: '2026-10-27T13:57:00Z',
  portCalls: [
    {
      portCallId: 1684996,
      portCallTimestamp: '2026-10-27T08:40:05.000Z',
      portToVisit: 'FIHEL',
      prevPort: 'DETRV',
      nextPort: 'DETRV',
      arrivalWithCargo: true,
      discharge: 1,
      shipMasterArrival: 'Captain Private Person Name',
      shipMasterDeparture: 'Captain Private Person Name',
      vesselName: 'Finnsirius',
      radioCallSign: 'OJUK',
      imoLloyds: 9902419,
      mmsi: 230000000,
      nationality: 'FI',
      vesselTypeCode: 20,
      agentInfo: [
        { name: 'Finnlines Oyj.' },
        { name: 'Finnsteve Oy Ab, Turku' },
        { name: 'Matti Meikäläinen' },
      ],
      portAreaDetails: [
        {
          portAreaCode: 'VUOS',
          portAreaName: 'Vuosaaren satama',
          berthCode: 'VC2',
          berthName: 'VC2',
          eta: '2026-10-30T10:00:00.000Z',
          etd: '2026-10-30T18:30:00.000Z',
          ata: '2015-01-03T07:25:00.000Z',
        },
      ],
    },
    {
      portCallId: 3353655,
      portCallTimestamp: '2026-10-27T07:30:18.000Z',
      portToVisit: 'FIHKO',
      prevPort: 'PLGDY',
      nextPort: 'PLGDY',
      arrivalWithCargo: false,
      vesselName: 'Baltic Express',
      imoLloyds: 9123456,
      nationality: 'SE',
      portAreaDetails: [
        {
          berthName: 'B1',
          eta: '2026-10-28T06:00:00.000Z',
          etd: '2026-10-28T10:00:00.000Z',
        },
      ],
    },
  ],
};

test('1. normalizePortCalls strips shipMaster personal data and calculates turnaround hours', () => {
  const rows = normalizePortCalls(SAMPLE_RAW);
  assert.equal(rows.length, 2);
  const hel = rows[0];
  assert.equal(hel.portToVisit, 'FIHEL');
  assert.equal(hel.portName, 'Port of Helsinki');
  assert.equal(hel.plannedTurnaroundHours, 8.5);
  assert.equal(hel.ataUtc, null); // 2015 placeholder stripped
  assert.ok(!JSON.stringify(hel).includes('Captain Private Person Name'));
  assert.deepEqual(hel.shippingAgents, ['Finnlines Oyj.', 'Finnsteve Oy Ab, Turku']);
  assert.equal(hel.attribution, 'Source: Fintraffic / digitraffic.fi, license CC 4.0 BY');
});

test('2. normalizePortCalls filters by ports, cargoOnly, and vesselQuery', () => {
  const cargoOnly = normalizePortCalls(SAMPLE_RAW, { cargoOnly: true });
  assert.equal(cargoOnly.length, 1);
  assert.equal(cargoOnly[0].vesselName, 'Finnsirius');

  const hanko = normalizePortCalls(SAMPLE_RAW, { ports: ['FIHKO'] });
  assert.equal(hanko.length, 1);
  assert.equal(hanko[0].portToVisit, 'FIHKO');

  const imoMatch = normalizePortCalls(SAMPLE_RAW, { vesselQuery: '9902419' });
  assert.equal(imoMatch.length, 1);
});

test('3. buildPortCongestionSummary aggregates port metrics accurately', () => {
  const calls = normalizePortCalls(SAMPLE_RAW);
  const summary = buildPortCongestionSummary(calls);
  assert.equal(summary.length, 2);
  const hel = summary.find((s) => s.portToVisit === 'FIHEL');
  assert.equal(hel.totalPortCalls, 1);
  assert.equal(hel.cargoSharePct, 100);
  assert.equal(hel.avgPlannedTurnaroundHours, 8.5);
  assert.equal(hel.attribution, 'Source: Fintraffic / digitraffic.fi, license CC 4.0 BY');
});

test('4. sanitizeAgentNames keeps corporate entities and drops个人/natural person names', () => {
  assert.deepEqual(sanitizeAgentNames([{ name: 'Finnlines Oyj' }, { name: 'John Smith' }]), ['Finnlines Oyj']);
});

test('5. digitrafficAttribution matches Fintraffic exact CC BY 4.0 string', () => {
  const attr = digitrafficAttribution();
  assert.equal(attr.attribution, 'Source: Fintraffic / digitraffic.fi, license CC 4.0 BY');
});
