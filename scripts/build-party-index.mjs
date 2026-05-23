/**
 * Scans src/party/*.json (except index.json) and writes src/party/index.json
 * Run after copying player export files into src/party/
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const partyDir = path.join(__dirname, '..', 'src', 'party');

if (!fs.existsSync(partyDir)) {
  fs.mkdirSync(partyDir, { recursive: true });
}

const files = fs
  .readdirSync(partyDir)
  .filter((name) => name.endsWith('.json') && name !== 'index.json')
  .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

const index = {
  version: 1,
  description: 'Party character files for the GM console (auto-generated)',
  files
};

fs.writeFileSync(path.join(partyDir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
console.log(`Party index: ${files.length} file(s) → src/party/index.json`);
for (const f of files) console.log(`  • ${f}`);
