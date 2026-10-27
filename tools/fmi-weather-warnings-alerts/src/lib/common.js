// Shared helpers for all Open-Data Tool Factory tools.
// SOURCE OF TRUTH: /workspace/open-data-factory/shared/common.js
// Copied into each tool's src/lib/common.js by scripts/sync-shared.mjs (Apify builds each tool dir standalone).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
let _licences;
export function licences() {
  if (!_licences) _licences = JSON.parse(readFileSync(path.join(here, '..', 'licences.json'), 'utf8'));
  return _licences;
}

/** Attribution block that MUST be attached to every output record / response. */
export function attributionFor(sourceKey, extra = {}) {
  const s = licences().sources[sourceKey];
  if (!s) throw new Error(`Unknown source ${sourceKey}`);
  if (s.status === 'EXCLUDED') throw new Error(`Source ${sourceKey} is EXCLUDED by the licence register`);
  return {
    attribution: s.attribution,
    licence: s.licence,
    licenceUrl: s.licenceUrl,
    termsUrl: s.termsUrl,
    ...extra,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export { sleep };

/** Minimal rate limiter: guarantees >= minIntervalMs between request starts (per process). */
export function createLimiter(minIntervalMs) {
  let next = 0;
  let chain = Promise.resolve();
  return function schedule(fn) {
    const run = chain.then(async () => {
      const wait = next - Date.now();
      if (wait > 0) await sleep(wait);
      next = Date.now() + minIntervalMs;
    });
    chain = run.catch(() => {});
    return run.then(fn);
  };
}

export class HttpError extends Error {
  constructor(status, body, url) {
    super(`HTTP ${status} for ${url}: ${String(body).slice(0, 300)}`);
    this.status = status;
    this.body = body;
    this.url = url;
  }
}

/**
 * fetch JSON with retry on 429/5xx (exponential backoff, honours Retry-After).
 * fetchImpl is injectable for tests.
 */
export async function fetchJson(url, { fetchImpl = globalThis.fetch, limiter, retries = 3, timeoutMs = 30000, userAgent, ...init } = {}) {
  const headers = { accept: 'application/json', 'user-agent': userAgent || 'open-data-tool-factory/0.1 (+contact: maintainer)', ...(init.headers || {}) };
  let attempt = 0;
  for (;;) {
    const doFetch = () => fetchImpl(url, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) });
    const res = limiter ? await limiter(doFetch) : await doFetch();
    const text = await res.text();
    if (res.ok) {
      try { return text ? JSON.parse(text) : null; } catch (e) { throw new HttpError(res.status, `Invalid JSON: ${text.slice(0, 200)}`, url); }
    }
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      const ra = Number(res.headers?.get?.('retry-after'));
      await sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 1000 * 2 ** attempt);
      attempt++;
      continue;
    }
    throw new HttpError(res.status, text, url);
  }
}

/** Fixture-backed fetch for offline tests: routes is [{match: RegExp|fn, file|json|status}] */
export function fixtureFetch(routes) {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    for (const r of routes) {
      const ok = typeof r.match === 'function' ? r.match(String(url), init) : r.match.test(String(url));
      if (!ok) continue;
      const body = r.json !== undefined ? JSON.stringify(typeof r.json === 'function' ? r.json(String(url), init) : r.json) : readFileSync(r.file, 'utf8');
      return new Response(body, { status: r.status || 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: 'no fixture route', url: String(url) }), { status: 404 });
  };
  f.calls = calls;
  return f;
}

export function isoDate(d) { return new Date(d).toISOString().slice(0, 10); }
export function uniq(arr) { return [...new Set((arr || []).filter((x) => x !== null && x !== undefined && x !== ''))]; }
