// Pay-per-event helper. Charging only takes effect when the actor runs on Apify with PPE pricing
// configured in Apify Console (NOT configured yet - pricing is only a proposal in the README).
// Locally and without PPE this is a no-op.
import { Actor, log } from 'apify';

export async function chargeSafe(eventName, count = 1) {
  try {
    return await Actor.charge({ eventName, count });
  } catch (e) {
    log.debug(`charge(${eventName}) skipped: ${e.message}`);
    return null;
  }
}

/**
 * Push one item and charge for it via the SDK (Actor.pushData(item, eventName)): the SDK writes the
 * item and charges only for items actually stored within the user's budget. A failed write throws
 * (-> Actor.fail) and is never charged. Without PPE pricing (local runs) the charge is a no-op.
 * Returns { stop: true } once the user's max-charge limit is reached.
 */
export async function pushCharged(item, eventName) {
  const res = await Actor.pushData(item, eventName);
  return { stop: Boolean(res?.eventChargeLimitReached) };
}
