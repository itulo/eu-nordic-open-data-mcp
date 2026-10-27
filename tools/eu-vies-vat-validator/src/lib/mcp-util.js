// Shared MCP helpers (copied into each tool by scripts/sync-shared.mjs).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { attributionFor } from './common.js';

/** Wrap a JSON payload as an MCP tool result. Attribution is always present at top level. */
export function jsonResult(sourceKey, payload, extra = {}) {
  const body = { ...attributionFor(sourceKey), ...extra, ...payload };
  return { content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] };
}

export function errorResult(sourceKey, err) {
  const body = { error: String(err?.message || err), ...attributionFor(sourceKey) };
  return { isError: true, content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] };
}

/** Tiny JSON state file for MCP alert modes (local only). */
export function stateFile(name) {
  const dir = process.env.ODF_STATE_DIR || path.join(os.homedir(), '.cache', 'open-data-factory');
  const file = path.join(dir, `${name}.json`);
  return {
    file,
    read() { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return {}; } },
    write(obj) { mkdirSync(dir, { recursive: true }); writeFileSync(file, JSON.stringify(obj)); },
  };
}
