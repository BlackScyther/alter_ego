import Database from 'better-sqlite3';
const db = new Database('./data/alter_eger.db', { readonly: true });

const lang = db
  .prepare(
    `SELECT listing_fields, body_html FROM entries WHERE category_slug='background' AND (body_html LIKE '%<i>Language%' OR body_html LIKE '%<b>Language%') LIMIT 3`
  )
  .all();
for (const r of lang) {
  console.log('LANG', JSON.parse(r.listing_fields).Name);
  console.log(r.body_html.match(/Language[\s\S]{0,100}/gi));
}

const scholar = db.prepare(`SELECT body_html FROM entries WHERE listing_fields LIKE '%Scholar%' AND category_slug='background' LIMIT 1`).get();
console.log('\nSCHOLAR FULL TAIL:', scholar?.body_html?.slice(-400));

const withBenefit = db
  .prepare(`SELECT listing_fields, body_html FROM entries WHERE category_slug='background' AND body_html LIKE '%<i>Benefit:%' LIMIT 5`)
  .all();
for (const r of withBenefit) {
  const name = JSON.parse(r.listing_fields).Name;
  const benefit = r.body_html.match(/<i>Benefit:[\s\S]*?(?=<br>|<p class=publishedIn)/i)?.[0];
  console.log('\nBENEFIT', name, benefit?.slice(0, 120));
}
