import { escapeHtml as esc } from '../../shared/escape-html.js';
import { formatPowerListingMeta } from '../power-filter.js';
import { pickerCardClass, setPickerCardSelected, clearPickerCardSelection } from '../picker/picker-card.js';
import { linkCompendiumTermsInText } from '../../ui/compendium-links.js';

/**
 * @param {HTMLElement} parent
 * @param {string} title
 */
function renderGroup(parent, title) {
  const group = document.createElement('div');
  group.className = 'race-grants-group power-collection-group';
  group.innerHTML = `<h4 class="power-collection-group-title">${esc(title)}</h4><div class="race-grants-cards power-collection-cards flex flex-col gap-2 w-full"></div>`;
  parent.appendChild(group);
  return group.querySelector('.race-grants-cards');
}

/**
 * @param {HTMLElement} cardsEl
 * @param {object} opts
 */
function renderGrantCard(cardsEl, { id, name, meta, linkIndex, onPreview }) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `${pickerCardClass(false)} power-collection-card race-grant-card`;
  btn.dataset.id = id;
  btn.dataset.readonly = 'true';
  const linkedName = linkIndex ? linkCompendiumTermsInText(name, linkIndex) : esc(name);
  btn.innerHTML = `
    <span class="block">${linkedName}</span>
    <span class="block text-sm font-normal text-slate-400">${esc(meta)}</span>`;
  btn.addEventListener('click', () => {
    onPreview?.(id);
    clearPickerCardSelection(cardsEl.closest('.race-grants-panel') ?? cardsEl);
    setPickerCardSelected(btn, true);
  });
  cardsEl.appendChild(btn);
}

/**
 * @param {HTMLElement} root
 * @param {object} ctx
 */
export async function renderRaceGrantsPanel(root, ctx) {
  const { character, compendium, linkIndex, onPreview } = ctx;
  root.innerHTML = '';
  root.classList.add('race-grants-panel');

  const powerIds = character.selections?.racePowerIds ?? [];
  const featIds = character.selections?.raceFeatIds ?? [];

  if (powerIds.length) {
    const cardsEl = renderGroup(root, 'Racial powers');
    for (const pid of powerIds) {
      const entry = await compendium.getEntry(pid);
      if (!entry) continue;
      renderGrantCard(cardsEl, {
        id: pid,
        name: entry.listing_fields?.Name ?? pid,
        meta: formatPowerListingMeta(entry.listing_fields),
        linkIndex,
        onPreview: async (id) => onPreview?.(await compendium.getEntry(id))
      });
    }
  }

  if (featIds.length) {
    const cardsEl = renderGroup(root, 'Racial feats');
    for (const fid of featIds) {
      const entry = await compendium.getEntry(fid);
      if (!entry) continue;
      const meta = [entry.listing_fields?.Tier, entry.listing_fields?.SourceBook].filter(Boolean).join(' · ');
      renderGrantCard(cardsEl, {
        id: fid,
        name: entry.listing_fields?.Name ?? fid,
        meta: meta || 'Feat',
        linkIndex,
        onPreview: async (id) => onPreview?.(await compendium.getEntry(id))
      });
    }
  }
}
