// Runs every tool's offline fixture tests from the repo root (uses the root node_modules).
import { readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const tools = readdirSync('tools').filter((t) => existsSync(`tools/${t}/test`));
let failed = 0;
for (const t of tools) {
  const files = readdirSync(`tools/${t}/test`).filter((f) => f.endsWith('.test.js')).map((f) => `tools/${t}/test/${f}`);
  if (!files.length) continue;
  const r = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit', env: { ...process.env, NODE_PATH: 'node_modules' } });
  if (r.status !== 0) { failed++; console.error(`FAILED: ${t}`); }
}
process.exit(failed ? 1 : 0);
