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
  group.className = 'class-grants-group power-collection-group';
  group.innerHTML = `<h4 class="power-collection-group-title">${esc(title)}</h4><div class="class-grants-cards power-collection-cards flex flex-col gap-2 w-full"></div>`;
  parent.appendChild(group);
  return group.querySelector('.class-grants-cards');
}

/**
 * @param {HTMLElement} cardsEl
 * @param {object} opts
 */
function renderGrantCard(cardsEl, { id, name, meta, linkIndex, onPreview }) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `${pickerCardClass(false)} power-collection-card class-grant-card`;
  btn.dataset.id = id;
  btn.dataset.readonly = 'true';
  const linkedName = linkIndex ? linkCompendiumTermsInText(name, linkIndex) : esc(name);
  btn.innerHTML = `
    <span class="block">${linkedName}</span>
    <span class="block text-sm font-normal text-slate-400">${esc(meta)}</span>`;
  btn.addEventListener('click', () => {
    onPreview?.(id);
    clearPickerCardSelection(cardsEl.closest('.class-grants-panel') ?? cardsEl);
    setPickerCardSelected(btn, true);
  });
  cardsEl.appendChild(btn);
}

/**
 * @param {HTMLElement} root
 * @param {object} ctx
 */
export async function renderClassGrantsPanel(root, ctx) {
  const { character, compendium, linkIndex, onPreview } = ctx;
  root.innerHTML = '';
  root.classList.add('class-grants-panel');

  const powerIds = character.selections?.classPowerIds ?? [];

  if (powerIds.length) {
    const cardsEl = renderGroup(root, 'Class powers');
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
}
