import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseVatIdentifier,
  isCorporateEntityName,
  sanitizeViesTraderData,
  createViesClient,
  viesAttribution,
} from '../src/lib/vies.js';

test('1. parseVatIdentifier normalizes spaces, dashes, and GR->EL', () => {
  assert.deepEqual(parseVatIdentifier('fi 0112-0389'), {
    countryCode: 'FI',
    vatNumber: '01120389',
    fullVatNumber: 'FI01120389',
  });
  assert.deepEqual(parseVatIdentifier('GR 123456789'), {
    countryCode: 'EL',
    vatNumber: '123456789',
    fullVatNumber: 'EL123456789',
  });
});

test('2. isCorporateEntityName distinguishes corporate legal forms from natural persons', () => {
  assert.equal(isCorporateEntityName('Nokia Oyj'), true);
  assert.equal(isCorporateEntityName('Fingrid Oyj'), true);
  assert.equal(isCorporateEntityName('Example Digital GmbH'), true);
  assert.equal(isCorporateEntityName('Acme Polska Sp. z o.o.'), true);
  assert.equal(isCorporateEntityName('Ojala Satu Marjut'), false);
  assert.equal(isCorporateEntityName('Matti Meikäläinen'), false);
});

test('3. sanitizeViesTraderData redacts sole traders and strips c/o lines on corporations', () => {
  const sole = sanitizeViesTraderData('Ojala Satu Marjut', 'Latokartanonkaari 41 A 2\n00790 HELSINKI');
  assert.equal(sole.gdprRedacted, true);
  assert.equal(sole.entityClassification, 'sole_trader_or_natural_person_redacted');
  assert.ok(!sole.companyName.includes('Ojala'));
  assert.ok(!sole.companyAddress.includes('Latokartanonkaari'));

  const corp = sanitizeViesTraderData('Fingrid Oyj', 'c/o John Doe\nLäkkisepäntie 21\n00620 HELSINKI');
  assert.equal(corp.companyName, 'Fingrid Oyj');
  assert.equal(corp.entityClassification, 'corporate_entity');
  assert.equal(corp.gdprRedacted, true);
  assert.ok(!corp.companyAddress.includes('John Doe'));
  assert.ok(corp.companyAddress.includes('Läkkisepäntie 21'));
});

test('4. createViesClient validates corporate VAT and flags cross-border reverse charge', async () => {
  const client = createViesClient({
    minIntervalMs: 1,
    fetchImpl: async () => new Response(JSON.stringify({
      countryCode: 'FI',
      vatNumber: '01120389',
      requestDate: '2026-10-27T14:00:00.000Z',
      valid: true,
      name: 'Nokia Oyj',
      address: 'Karakaari 7\n02610 ESPOO',
    }), { status: 200 }),
  });

  const res = await client.validateVatNumber('FI01120389', { supplierCountryCode: 'DE' });
  assert.equal(res.valid, true);
  assert.equal(res.companyName, 'Nokia Oyj');
  assert.equal(res.isCrossBorderEuB2B, true);
  assert.equal(res.reverseChargeCandidate, true);
  assert.ok(res.attribution.includes('Decision 2011/833/EU'));
});

test('5. createViesClient handles invalid country prefix without hitting network', async () => {
  let called = false;
  const client = createViesClient({
    fetchImpl: async () => { called = true; return new Response('{}', { status: 200 }); },
  });
  const res = await client.validateVatNumber('US123456789');
  assert.equal(called, false);
  assert.equal(res.valid, false);
  assert.equal(res.userError, 'INVALID_FORMAT_OR_COUNTRY_PREFIX');
  assert.ok(res.attribution.includes('VIES'));
});

test('6. viesAttribution includes mandatory Commission reuse notice and GDPR disclaimer', () => {
  const attr = viesAttribution();
  assert.ok(attr.attribution.includes('European Commission, VIES'));
  assert.ok(attr.legalDisclaimer.includes('GDPR'));
});
