import { createFmiAlertsClient } from '../src/lib/fmi-alerts.js';

const client = createFmiAlertsClient();
const alerts = await client.fetchActiveAlerts({ maxAlerts: 10 });
const obs = await client.fetchWeatherObservations({ places: ['Helsinki', 'Vaasa', 'Oulu'], hoursBack: 2 });
const sea = await client.fetchSeaLevelObservations({ hoursBack: 2, maxStations: 5 });

if (!obs.length && !sea.length) {
  console.error('Smoke failed: no observations returned from FMI WFS');
  process.exit(1);
}
for (const r of [...alerts, ...obs, ...sea]) {
  if (!r.attribution || !r.attribution.includes('Ilmatieteen laitoksen avoin data')) {
    console.error('Missing mandatory FMI attribution on record:', r);
    process.exit(1);
  }
}
console.log(JSON.stringify({
  ok: true,
  alertsCount: alerts.length,
  weatherObsCount: obs.length,
  seaLevelObsCount: sea.length,
  sampleObs: obs[0],
}));
