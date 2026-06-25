/**
 * Audit compendium races against the subrace convention used by Alter Ego.
 *
 * Convention (iws.mx compendium HTML):
 * 1. Core race: has <b>RACIAL TRAITS</b> block with ability scores, size, speed, etc.
 * 2. Typical subrace: no RACIAL TRAITS; has <h3>…Benefits</h3> with traits that
 *    "replace" parent racial features (e.g. "replaces Dragonborn Fury").
 * 3. Exceptions: some mapped subraces are full entries with RACIAL TRAITS (Drow, Tinker Gnome).
 *
 * Mapped ids live in metadata/race-subraces.json. Run after compendium re-import:
 *   node scripts/audit-race-subraces.mjs
 *
 * Exit code 1 when benefit-only entries are not in the map.
 */
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const dbPaths = ['data/alter_ego.db', 'dist/app/data/alter_ego.db'];
const dbPath = dbPaths.map((p) => path.join(root, p)).find((p) => fs.existsSync(p));
if (!dbPath) {
  console.error('No compendium DB found. Import data first.');
  process.exit(1);
}

const db = new Database(dbPath);
const existing = JSON.parse(
  fs.readFileSync(path.join(root, 'metadata/race-subraces.json'), 'utf8')
).subracesByParent;
const mappedSubIds = new Set(Object.values(existing).flat());

const rows = db
  .prepare(
    `SELECT id, json_extract(listing_fields, '$.Name') AS name,
            json_extract(listing_fields, '$.SourceBook') AS source,
            body_html
     FROM entries WHERE category_slug = 'race'
     ORDER BY name`
  )
  .all();

/** @type {Array<{ id: string, name: string, source: string, hasTraits: boolean, hasBenefits: boolean, replaces: string[] }>} */
const analysis = [];

for (const r of rows) {
  const html = r.body_html ?? '';
  const hasTraits = /<b>\s*RACIAL\s+TRAITS\s*<\/b>/i.test(html);
  const hasBenefits = /<h3[^>]*>[^<]*\bbenefits?\b/i.test(html);
  const replaces = [...html.matchAll(/replaces\s+([^.<\n]+)/gi)].map((m) =>
    m[1].trim().replace(/<[^>]+>/g, '')
  );
  analysis.push({
    id: r.id,
    name: r.name,
    source: r.source,
    hasTraits,
    hasBenefits,
    replaces
  });
}

const coreRaces = analysis.filter((r) => r.hasTraits);
const benefitOnly = analysis.filter((r) => !r.hasTraits && r.hasBenefits);
const unmappedBenefitOnly = benefitOnly.filter((r) => !mappedSubIds.has(r.id));
const mappedSubNotBenefitOnly = analysis.filter(
  (r) => mappedSubIds.has(r.id) && r.hasTraits
);

console.log('=== Core races (RACIAL TRAITS) ===');
for (const r of coreRaces) {
  const subs = existing[r.id] ?? [];
  console.log(`${r.id}\t${r.name}\tsubs=${subs.join(',') || 'none'}`);
}

console.log('\n=== Benefit-only entries (likely subraces) ===');
for (const r of benefitOnly) {
  const mapped = mappedSubIds.has(r.id) ? 'MAPPED' : 'UNMAPPED';
  console.log(
    `${mapped}\t${r.id}\t${r.name}\treplaces: ${r.replaces.join('; ') || '—'}`
  );
}

if (unmappedBenefitOnly.length) {
  console.log('\n=== UNMAPPED benefit-only (add to race-subraces.json) ===');
  for (const r of unmappedBenefitOnly) {
    console.log(`${r.id}\t${r.name}\treplaces: ${r.replaces.join('; ')}`);
  }
}

if (mappedSubNotBenefitOnly.length) {
  console.log('\n=== Mapped subraces with RACIAL TRAITS (known exceptions) ===');
  for (const r of mappedSubNotBenefitOnly) {
    console.log(`${r.id}\t${r.name}`);
  }
}

console.log(
  `\nTotals: ${rows.length} races, ${coreRaces.length} core, ${benefitOnly.length} benefit-only, ${unmappedBenefitOnly.length} unmapped`
);

if (unmappedBenefitOnly.length) {
  process.exit(1);
}
