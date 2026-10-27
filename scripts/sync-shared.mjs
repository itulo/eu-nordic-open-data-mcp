// Copies shared/common.js and licences.json into every tool (each tool must build standalone on Apify).
import { copyFileSync, readdirSync, mkdirSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
for (const t of readdirSync(path.join(root, 'tools'))) {
  const dir = path.join(root, 'tools', t, 'src');
  mkdirSync(path.join(dir, 'lib'), { recursive: true });
  copyFileSync(path.join(root, 'shared', 'common.js'), path.join(dir, 'lib', 'common.js'));
  copyFileSync(path.join(root, 'licences.json'), path.join(dir, 'licences.json'));
  for (const f of ['charge.js', 'mcp-util.js']) copyFileSync(path.join(root, 'shared', f), path.join(dir, 'lib', f));
  console.log('synced', t);
}
