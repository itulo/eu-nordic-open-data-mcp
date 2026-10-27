import { createViesClient } from '../src/lib/vies.js';

const client = createViesClient();
const status = await client.checkMemberStatesStatus();
if (!status.countries.length) {
  console.error('Smoke failed: empty VIES check-status countries');
  process.exit(1);
}

// Validate Nokia Oyj (FI01120389) and Fingrid Oyj (FI10728943)
const results = await client.validateBatch(['FI01120389', 'FI10728943'], { supplierCountryCode: 'DE' });
for (const r of results) {
  if (!r.attribution || !r.attribution.includes('Decision 2011/833/EU')) {
    console.error('Missing mandatory attribution on VIES record:', r);
    process.exit(1);
  }
}
console.log(JSON.stringify({
  ok: true,
  vowAvailable: status.vowAvailable,
  memberStatesCount: status.countries.length,
  validated: results.map((r) => ({
    fullVatNumber: r.fullVatNumber,
    valid: r.valid,
    companyName: r.companyName,
    entityClassification: r.entityClassification,
    reverseChargeCandidate: r.reverseChargeCandidate,
  })),
}));
