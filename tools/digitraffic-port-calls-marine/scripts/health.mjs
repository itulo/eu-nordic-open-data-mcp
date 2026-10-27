import { createDigitrafficClient } from '../src/lib/digitraffic.js';

try {
  const client = createDigitrafficClient();
  const raw = await client.fetchRawPortCalls();
  const count = raw?.portCalls?.length || 0;
  if (!count) throw new Error('Digitraffic returned 0 portCalls');
  console.log(JSON.stringify({ status: 'up', source: 'digitraffic', dataUpdatedTime: raw.dataUpdatedTime, portCallsCount: count }));
} catch (err) {
  console.error(JSON.stringify({ status: 'down', source: 'digitraffic', error: String(err.message || err) }));
  process.exit(1);
}
