import Database from 'better-sqlite3';
import { parseBackgroundEntry, renderBackgroundPreviewHtml } from '../src/character/background-parse.js';

const db = new Database('./data/alter_eger.db', { readonly: true });

function rowToEntry(r) {
  return {
    id: r.id,
    listing_fields: JSON.parse(r.listing_fields),
    body_html: r.body_html,
    skill_bonuses: r.skill_bonuses ? JSON.parse(r.skill_bonuses) : undefined
  };
}

const names = ['Cult Survivor', 'Accursed Lineage', 'Airspur', 'Dragon Magazine Scholar', 'Auspicious Birth'];
for (const n of names) {
  const r = db
    .prepare(`SELECT * FROM entries WHERE listing_fields LIKE ? AND category_slug='background' LIMIT 1`)
    .get(`%${n}%`);
  if (!r) {
    console.log('MISSING', n);
    continue;
  }
  const entry = rowToEntry(r);
  const parsed = parseBackgroundEntry(entry);
  console.log('\n===', entry.listing_fields.Name, '===');
  console.log('skills:', parsed.associatedSkills, 'kind:', parsed.skillBonusKind, 'fixed:', parsed.fixedSkillBonuses);
  console.log('summary:', parsed.descriptionSummary?.slice(0, 60));
  console.log('benefits:', parsed.benefitRows.map((b) => b.label));
}
