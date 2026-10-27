import { createFmiAlertsClient } from '../src/lib/fmi-alerts.js';

try {
  const client = createFmiAlertsClient();
  const obs = await client.fetchWeatherObservations({ places: ['Helsinki'], hoursBack: 2 });
  if (!obs.length) throw new Error('Empty weather observations for Helsinki');
  console.log(JSON.stringify({ status: 'up', source: 'fmi', latestHelsinkiObsUtc: obs[0].observedAtUtc, tempC: obs[0].temperatureC }));
} catch (err) {
  console.error(JSON.stringify({ status: 'down', source: 'fmi', error: String(err.message || err) }));
  process.exit(1);
}
