// Apify actor: France company search & SIREN lookup (Insee Sirene via API Recherche d'entreprises).
import { Actor, log } from 'apify';
import { createSireneClient } from './lib/sirene.js';
import { pushCharged } from './lib/charge.js';

await Actor.init();
try {
  const input = (await Actor.getInput()) || {};
  const mode = input.mode || (input.sirenNumbers?.length ? 'lookup' : 'search');
  const client = createSireneClient();
  const summary = { mode };
  let pushed = 0;
  if (mode === 'lookup') {
    const list = (input.sirenNumbers || []).slice(0, 1000);
    if (!list.length) throw new Error('mode=lookup needs sirenNumbers (9-digit SIREN or 14-digit SIRET).');
    const stats = { notFound: [], invalid: [], excluded: {} };
    const recs = await client.lookup(list, stats, { excludeMarketingOptOut: input.excludeMarketingOptOut !== false });
    for (const rec of recs) {
      const { stop } = await pushCharged(rec, 'company-result');
      pushed++;
      if (stop) break;
    }
    Object.assign(summary, { requested: list.length, ...stats });
  } else {
    const stats = { pages: 0, seen: 0, excluded: {} };
    for await (const rec of client.search(input, stats)) {
      const { stop } = await pushCharged(rec, 'company-result');
      pushed++;
      if (stop) { summary.stoppedAtChargeLimit = true; break; }
    }
    Object.assign(summary, stats);
  }
  summary.returned = pushed;
  summary.excludeMarketingOptOut = input.excludeMarketingOptOut !== false;
  if (!summary.excludeMarketingOptOut) summary.marketingOptOutNotice = 'excludeMarketingOptOut is OFF: records with marketingOptOut=true may only be used for non-marketing purposes (KYB, compliance, credit checks), never for prospecting. You are the data controller.';
  summary.personalDataPolicy = 'Entreprises individuelles and groupings of natural persons are excluded; Insee partial-diffusion (P) fields are withheld; companies opposed to prospecting are excluded unless excludeMarketingOptOut=false; no directors, finances, street addresses or coordinates.';
  log.info(`SIRENE ${mode}: ${pushed} companies`, summary);
  await Actor.setValue('OUTPUT_SUMMARY', summary);
} catch (err) {
  log.exception(err, 'Run failed');
  await Actor.fail(String(err.message || err));
}
await Actor.exit();
