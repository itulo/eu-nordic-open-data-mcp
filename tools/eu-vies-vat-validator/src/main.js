// Apify actor entry point: Official European Commission VIES B2B VAT Batch Validator & Reverse-Charge Check.
import { Actor, log } from 'apify';
import { createViesClient, viesAttribution } from './lib/vies.js';
import { chargeSafe } from './lib/charge.js';

await Actor.init();
try {
  await chargeSafe('actor-start');
  const input = (await Actor.getInput()) || {};
  const {
    mode = 'validate_batch',
    vatNumbers = ['FI01120389', 'FI10728943'],
    supplierCountryCode = 'FI',
    requesterMemberStateCode = '',
    requesterNumber = '',
    includeMemberStateStatus = false,
  } = input;

  const client = createViesClient();
  const records = [];

  if (mode === 'member_state_status' || includeMemberStateStatus) {
    const { countries } = await client.checkMemberStatesStatus();
    records.push(...countries);
  }

  if (mode === 'validate_batch') {
    const validated = await client.validateBatch(vatNumbers, {
      supplierCountryCode,
      requesterMemberStateCode,
      requesterNumber,
    });
    records.push(...validated);
  }

  for (const r of records) {
    await Actor.pushData(r);
    await chargeSafe('vat-check', 1);
  }

  const validCount = records.filter((r) => r.recordType === 'vies_vat_validation' && r.valid).length;
  const gdprRedactedCount = records.filter((r) => r.gdprRedacted).length;

  await Actor.setValue('OUTPUT_SUMMARY', {
    mode,
    recordsWritten: records.length,
    validCount,
    gdprRedactedCount,
    ...viesAttribution(),
  });
  log.info(`eu-vies-vat-validator completed: mode=${mode}, records=${records.length}, valid=${validCount}`);
} catch (err) {
  log.exception(err, 'Run failed');
  await Actor.fail(String(err.message || err));
}
await Actor.exit();
