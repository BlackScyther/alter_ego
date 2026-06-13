import Database from 'better-sqlite3';
import { parseBackgroundEntry } from '../src/character/background-parse.js';

const db = new Database('./data/alter_eger.db', { readonly: true });
const rows = db
  .prepare(`SELECT id, listing_fields, body_html FROM entries WHERE category_slug = 'background' LIMIT 800`)
  .all();

let noSkills = 0;
let noChoice = 0;
let italicSkills = 0;
let rawTextFlavor = 0;
let publishedAsDesc = 0;
/** @type {string[]} */
const broken = [];

for (const r of rows) {
  const entry = { id: r.id, listing_fields: JSON.parse(r.listing_fields), body_html: r.body_html };
  const html = r.body_html;
  if (/<i>\s*Associated Skills/i.test(html)) italicSkills++;
  const afterFlav = html.replace(/<p[^>]*class\s*=\s*["']?flavortext["']?[^>]*>[\s\S]*?<\/p>/i, '');
  const hasNonMetaP = /<p(?![^>]*publishedIn)/i.test(afterFlav);
  if (!hasNonMetaP && afterFlav.replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, '').trim().length > 50) rawTextFlavor++;

  const parsed = parseBackgroundEntry(entry);
  const hasAssocInHtml = /Associated Skills/i.test(html);
  if (parsed.associatedSkills.length === 0 && hasAssocInHtml) {
    noSkills++;
    broken.push(JSON.parse(r.listing_fields).Name);
  }
  if (parsed.associatedSkills.length > 0 && parsed.skillBonusKind === 'none') noChoice++;
  if (parsed.descriptionSummary.includes('Published in')) publishedAsDesc++;
}

console.log({
  total: rows.length,
  italicSkills,
  rawTextFlavor,
  noSkills,
  noChoice,
  publishedAsDesc,
  brokenSample: broken.slice(0, 15)
});
