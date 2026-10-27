// Apify actor entry point: FMI Severe Weather & Marine Alerts (CAP) + Live Weather & Sea-Level Observations (WFS).
import { Actor, log } from 'apify';
import { createFmiAlertsClient, fmiAlertsAttribution, DEFAULT_OBS_PLACES } from './lib/fmi-alerts.js';
import { chargeSafe } from './lib/charge.js';

await Actor.init();
try {
  await chargeSafe('actor-start');
  const input = (await Actor.getInput()) || {};
  const {
    modes = ['active_alerts', 'weather_observations', 'sea_level_observations'],
    language = 'en-GB',
    minSeverity = 'Minor',
    regionFilter = '',
    includeCancelled = false,
    maxAlerts = 30,
    places = DEFAULT_OBS_PLACES,
    hoursBack = 2,
    maxSeaStations = 10,
  } = input;

  const client = createFmiAlertsClient();
  const records = [];

  if (modes.includes('active_alerts')) {
    const alerts = await client.fetchActiveAlerts({
      language,
      minSeverity,
      regionFilter,
      includeCancelled,
      maxAlerts,
    });
    records.push(...alerts);
  }

  if (modes.includes('weather_observations')) {
    const obs = await client.fetchWeatherObservations({ places, hoursBack });
    records.push(...obs);
  }

  if (modes.includes('sea_level_observations')) {
    const sea = await client.fetchSeaLevelObservations({ hoursBack, maxStations: maxSeaStations });
    records.push(...sea);
  }

  for (const r of records) {
    await Actor.pushData(r);
    await chargeSafe('weather-alert-or-obs', 1);
  }

  await Actor.setValue('OUTPUT_SUMMARY', {
    modes,
    language,
    minSeverity,
    places,
    recordsWritten: records.length,
    alertsCount: records.filter((r) => r.recordType === 'weather_alert').length,
    weatherObsCount: records.filter((r) => r.recordType === 'weather_observation').length,
    seaLevelObsCount: records.filter((r) => r.recordType === 'sea_level_observation').length,
    ...fmiAlertsAttribution(),
  });
  log.info(`fmi-weather-warnings-alerts completed: records=${records.length}`);
} catch (err) {
  log.exception(err, 'Run failed');
  await Actor.fail(String(err.message || err));
}
await Actor.exit();
