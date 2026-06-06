#!/usr/bin/env node
/**
 * Resolve universal PHB action names to glossary compendium IDs.
 * Run after compendium import: node tools/discover-universal-actions.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const metaPath = join(root, 'metadata', 'universal-actions.json');
const dbPath = join(root, 'data', 'alter_eger.db');

const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
const allNames = meta.groups.flatMap((g) =>
  g.matchNames.map((name) => ({ name, groupId: g.id }))
);

/** @type {Map<string, { id: string, name: string }>} */
const byLowerName = new Map();

let usedDb = false;

try {
  const Database = (await import('better-sqlite3')).default;
  if (readFileSync(dbPath, { encoding: 'utf8', flag: 'r' })) {
    const db = new Database(dbPath, { readonly: true });
    const rows = db
      .prepare(
        `SELECT id, json_extract(listing_fields, '$.Name') as name,
                json_extract(listing_fields, '$.Type') as type
         FROM entries
         WHERE category_slug = 'glossary' AND source = 'compendium'`
      )
      .all();
    for (const row of rows) {
      if (!row.name) continue;
      if (String(row.type) !== 'Rules Combat') continue;
      byLowerName.set(String(row.name).toLowerCase(), { id: row.id, name: row.name });
    }
    db.close();
    usedDb = true;
  }
} catch {
  /* fall through to iws listing fetch */
}

if (!usedDb) {
  const listingUrl = 'https://iws.mx/dnd/4e_database_files/glossary/_listing.js';
  const res = await fetch(listingUrl);
  const text = await res.text();
  const match = text.match(/od\.reader\.jsonp_data_listing\([^,]+,\s*"glossary",\s*\[[^\]]+\],\s*(\[[\s\S]*\])\s*\)/);
  if (match) {
    const rows = JSON.parse(match[1]);
    for (const row of rows) {
      const [id, name, , type] = row;
      if (type !== 'Rules Combat') continue;
      byLowerName.set(String(name).toLowerCase(), { id, name });
    }
  }
}

const resolved = [];
const missing = [];

for (const { name, groupId } of allNames) {
  const hit = byLowerName.get(name.toLowerCase());
  if (hit) {
    resolved.push({ id: hit.id, name: hit.name, groupId });
  } else {
    missing.push(name);
  }
}

meta.resolved = resolved;
writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');

console.log(`Resolved ${resolved.length} universal actions.`);
if (missing.length) {
  console.warn('Not found:', missing.join(', '));
}
