// One-command script to set isPublic: true on Batch 2 actors (#6-#10) once Apify's 5/24h publication quota resets.
import { api } from './deploy-apify.mjs';

const BATCH2 = [
  { slug: 'itulo/fmi-weather-warnings-alerts', id: 'z0lbkA3wM1ZIBo1QA' },
  { slug: 'itulo/eu-vies-vat-validator', id: 'Us9OpbdIXEyQnvN0z' },
  { slug: 'itulo/ecb-fx-rates-macro', id: 'wJlv2elTB7fccZmS4' },
  { slug: 'itulo/digitraffic-port-calls-marine', id: 'dxdnGaaKiTq4Mhql6' },
  { slug: 'itulo/enisa-euvd-vulnerabilities', id: 'nTcM1dvNigvGe5Zls' },
];

for (const { slug, id } of BATCH2) {
  const res = await api('PUT', `/acts/${id}`, { isPublic: true });
  const storeRes = await fetch(`https://apify.com/${slug}`);
  console.log(JSON.stringify({
    slug,
    id,
    putStatus: res.status,
    ok: res.ok,
    isPublic: res.data?.isPublic ?? false,
    storeHttpStatus: storeRes.status,
    error: res.error,
  }));
}
