import Database from 'better-sqlite3';
const db = new Database('./data/alter_ego.db', { readonly: true });
for (const n of ['Airspur', 'Auspicious Birth', 'Accursed Lineage']) {
  const r = db.prepare(`SELECT body_html FROM entries WHERE listing_fields LIKE ? AND category_slug='background' LIMIT 1`).get(`%${n}%`);
  console.log('\n====', n, '====\n', r?.body_html);
}
