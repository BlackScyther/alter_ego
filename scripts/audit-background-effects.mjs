/**
 * Classify background compendium entries by detected special effects.
 * Usage: node scripts/audit-background-effects.mjs [--csv]
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBackgroundEntry } from '../src/character/background-parse.js';
import { detectBackgroundEffects } from '../src/character/background-effects.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

/** @returns {Promise<object[]>} */
async function loadBackgroundEntries() {
  const dbPath = join(root, 'data', 'alter_ego.db');
  if (existsSync(dbPath)) {
    try {
      const Database = (await import('better-sqlite3')).default;
      const db = new Database(dbPath, { readonly: true });
      const rows = db
        .prepare(
          `SELECT e.id, e.body_html, e.listing_fields
           FROM entries e
           JOIN categories c ON c.id = e.category_id
           WHERE c.slug = 'background'`
        )
        .all();
      db.close();
      return rows.map((row) => ({
        id: row.id,
        body_html: row.body_html,
        listing_fields: JSON.parse(row.listing_fields ?? '{}')
      }));
    } catch (err) {
      console.warn('SQLite read failed, falling back to stub:', err.message);
    }
  }

  const stubPath = join(root, 'data', 'samples', 'compendium-stub.json');
  const stub = JSON.parse(readFileSync(stubPath, 'utf8'));
  return stub.categories?.background?.entries ?? [];
}

function escapeCsv(value) {
  const s = String(value ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const asCsv = process.argv.includes('--csv');
const entries = await loadBackgroundEntries();

/** @type {Array<{ id: string, name: string, effects: string, unmatched: string }>} */
const report = [];

for (const entry of entries) {
  const parsed = parseBackgroundEntry(entry);
  const effects = detectBackgroundEffects(entry, parsed);
  const mechanicalTypes = effects
    .map((e) => e.type)
    .filter((t) => t !== 'skill-bonus-choice' && t !== 'skill-bonus-fixed' && t !== 'benefit-display');

  const unmatched = parsed.benefitRows
    .map((r) => `${r.label}: ${r.valueText}`)
    .filter((line) => {
      const lower = line.toLowerCase();
      if (/language/i.test(lower)) return false;
      if (/associated skills/i.test(lower)) return false;
      return true;
    });

  report.push({
    id: entry.id,
    name: entry.listing_fields?.Name ?? entry.id,
    effects: [...new Set(mechanicalTypes)].join('; ') || '(none)',
    unmatched: unmatched.join(' | ')
  });
}

if (asCsv) {
  console.log('id,name,effects,unmatched_benefits');
  for (const row of report) {
    console.log([row.id, row.name, row.effects, row.unmatched].map(escapeCsv).join(','));
  }
} else {
  const withEffects = report.filter((r) => r.effects !== '(none)');
  console.log(`Audited ${report.length} backgrounds. ${withEffects.length} with special effects.\n`);
  for (const row of withEffects.slice(0, 50)) {
    console.log(`${row.name} (${row.id}): ${row.effects}`);
    if (row.unmatched) console.log(`  unmatched: ${row.unmatched}`);
  }
  if (withEffects.length > 50) {
    console.log(`\n... and ${withEffects.length - 50} more. Use --csv for full export.`);
  }
}
