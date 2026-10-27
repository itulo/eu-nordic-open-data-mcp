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
