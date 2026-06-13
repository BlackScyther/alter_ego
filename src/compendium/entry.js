import { compendium } from '../data/compendium.js';

const params = new URLSearchParams(location.search);
const entryId = params.get('id');

const titleEl = document.getElementById('entry-title');
const metaEl = document.getElementById('entry-meta');
const bodyEl = document.getElementById('entry-body');

async function main() {
  if (!entryId) {
    titleEl.textContent = 'Compendium entry';
    bodyEl.innerHTML = '<p class="entry-error">No entry id in URL. Use <code>?id=power1234</code>.</p>';
    return;
  }

  await compendium.ready();
  const entry = await compendium.getEntry(entryId);
  if (!entry) {
    titleEl.textContent = entryId;
    bodyEl.innerHTML = '<p class="entry-error">Entry not found in compendium.</p>';
    return;
  }

  const fields = entry.listing_fields ?? {};
  const name = fields.Name ?? entry.id;
  document.title = `${name} — Compendium`;
  titleEl.textContent = name;

  const metaParts = [entry.category_slug, fields.Type, fields.Tier, fields.Level, fields.SourceBook].filter(Boolean);
  metaEl.textContent = metaParts.join(' · ');

  bodyEl.innerHTML = entry.body_html ?? '<p>No description available.</p>';
}

main().catch((err) => {
  bodyEl.innerHTML = `<p class="entry-error">${err.message ?? String(err)}</p>`;
});
