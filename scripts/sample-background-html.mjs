import Database from 'better-sqlite3';

const db = new Database('./data/alter_ego.db', { readonly: true });

function sample(name) {
  const r = db
    .prepare(`SELECT body_html FROM entries WHERE listing_fields LIKE ? LIMIT 1`)
    .get(`%${name}%`);
  console.log('\n===', name, '===\n', r?.body_html?.slice(-500));
}

sample('Cult Survivor');
sample('Occupation - Scholar');
sample('Acolyte');
sample('Auspicious Birth');

// backgrounds with Language benefit in italic format
const lang = db
  .prepare(
    `SELECT listing_fields, substr(body_html, -400) as tail FROM entries WHERE category_slug='background' AND body_html LIKE '%Language:%' LIMIT 3`
  )
  .all();
for (const r of lang) {
  console.log('\n=== LANG', JSON.parse(r.listing_fields).Name, '===\n', r.tail);
}

// fixed skill bonus pattern
const fixed = db
  .prepare(
    `SELECT listing_fields, substr(body_html, -400) as tail FROM entries WHERE category_slug='background' AND body_html LIKE '%Skill Bonus:%' AND body_html NOT LIKE '%Choose one%' LIMIT 3`
  )
  .all();
for (const r of fixed) {
  console.log('\n=== FIXED', JSON.parse(r.listing_fields).Name, '===\n', r.tail);
}
