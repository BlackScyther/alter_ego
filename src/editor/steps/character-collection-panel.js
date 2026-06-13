import { escapeHtml as esc } from '../../shared/escape-html.js';
import { pickerCardClass, setPickerCardSelected, clearPickerCardSelection } from '../picker/picker-card.js';
import { collectAllCollectionItems } from '../../character/character-collection.js';
import { loadUniversalActionsMeta } from './power-collection-panel.js';
import { compendiumEntryPageUrl } from '../../ui/compendium-entry-url.js';
import { COLLAPSIBLE_CHEVRON_SVG } from '../collapsible-chevron.js';

/**
 * @param {HTMLElement} parent
 * @param {string} title
 * @param {{ compact?: boolean }} [opts]
 */
function renderSection(parent, title, opts = {}) {
  const section = document.createElement('section');
  section.className = 'character-collection-section power-collection-group';
  if (opts.compact) section.classList.add('character-collection-section--compact');
  section.innerHTML = `
    <h4 class="power-collection-group-title">${esc(title)}</h4>
    <div class="character-collection-cards power-collection-cards"></div>`;
  parent.appendChild(section);
  return section.querySelector('.character-collection-cards');
}

/**
 * @param {HTMLElement} cardsEl
 * @param {object} item
 * @param {object} ctx
 */
function renderItemCard(cardsEl, item, ctx) {
  const { onPreview, onActivateSlot, onActivateRitualSlot } = ctx;
  const selected = !!item.selected;
  const row = document.createElement('div');
  row.className = 'character-collection-row';

  const btn = document.createElement('button');
  btn.type = 'button';
  const extraClass = item.empty ? ' character-collection-card--empty' : '';
  const retrainClass = item.retrainable ? ' character-collection-card--retrain' : '';
  btn.className = `${pickerCardClass(selected)} character-collection-card character-collection-card--compact${extraClass}${retrainClass}`;
  btn.dataset.id = item.id;
  btn.dataset.category = item.category;
  if (item.slotId) btn.dataset.slotId = item.slotId;
  if (item.readonly) btn.dataset.readonly = 'true';
  if (item.empty) btn.dataset.empty = 'true';

  const retrainBadge = item.retrainable
    ? '<span class="character-collection-retrain-badge">Retrain</span>'
    : '';
  btn.innerHTML = `<span class="character-collection-card-label">${esc(item.name)}${retrainBadge}</span>`;

  btn.addEventListener('click', async () => {
    if (item.empty && item.category === 'ritual' && item.slotId) {
      onActivateRitualSlot?.(item.slotId);
      return;
    }
    if (item.slotId && (item.category === 'power' || item.category === 'feat')) {
      onActivateSlot?.(item.slotId);
    }
    if (!item.empty) {
      const entry = await ctx.compendium.getEntry(item.id);
      onPreview?.(entry);
    }
    clearPickerCardSelection(cardsEl.closest('.character-collection-cards-host') ?? cardsEl);
    if (!item.empty) setPickerCardSelected(btn, true);
  });

  row.appendChild(btn);

  if (!item.empty) {
    const openUrl = compendiumEntryPageUrl(item.id, location.pathname);
    const openLink = document.createElement('a');
    openLink.className = 'character-collection-open';
    openLink.href = openUrl;
    openLink.target = '_blank';
    openLink.rel = 'noopener noreferrer';
    openLink.title = 'Open compendium entry in new window';
    openLink.setAttribute('aria-label', `Open ${item.name} in compendium`);
    openLink.textContent = '↗';
    openLink.addEventListener('click', (e) => e.stopPropagation());
    row.appendChild(openLink);
  }

  cardsEl.appendChild(row);
  return btn;
}

/**
 * @param {HTMLElement} cardsEl
 * @param {object[]} items
 * @param {object} ctx
 */
function renderItemCards(cardsEl, items, ctx) {
  for (const item of items) {
    renderItemCard(cardsEl, item, ctx);
  }
}

/**
 * @param {HTMLElement} root
 * @param {object} ctx
 */
export async function renderCharacterCollectionPanel(root, ctx) {
  const {
    character,
    compendium,
    onPreview,
    onActivateSlot,
    onActivateRitualSlot,
    activeSlotId,
    universalMeta
  } = ctx;

  const body = root.classList?.contains('character-collection-cards-host')
    ? root
    : root.querySelector('.character-collection-cards-host') ?? root;
  body.innerHTML = '';

  const meta = universalMeta ?? (await loadUniversalActionsMeta());
  const { powers, feats, rituals } = await collectAllCollectionItems(character, compendium, {
    universalMeta: meta,
    retraining: !!character.builderFlags?.retraining
  });

  const universalPowers = powers.filter((p) => p.universal);
  const characterPowers = powers.filter((p) => !p.universal);

  if (characterPowers.length) {
    const cardsEl = renderSection(body, 'Powers');
    for (const item of characterPowers) {
      const selected = item.slotId && item.slotId === activeSlotId;
      renderItemCard(cardsEl, { ...item, selected }, {
        ...ctx,
        compendium,
        onPreview,
        onActivateSlot,
        onActivateRitualSlot
      });
    }
  }

  if (universalPowers.length) {
    const details = document.createElement('details');
    details.className = 'character-collection-universal';
    details.innerHTML = `<summary class="power-collection-group-title">Universal actions</summary>`;
    const cardsEl = document.createElement('div');
    cardsEl.className = 'character-collection-cards character-collection-cards--compact';
    details.appendChild(cardsEl);
    renderItemCards(cardsEl, universalPowers, {
      ...ctx,
      compendium,
      onPreview,
      onActivateSlot,
      onActivateRitualSlot
    });
    body.appendChild(details);
  }

  if (feats.length) {
    const cardsEl = renderSection(body, 'Feats');
    renderItemCards(cardsEl, feats, { ...ctx, compendium, onPreview, onActivateSlot, onActivateRitualSlot });
  }

  if (rituals.length) {
    const cardsEl = renderSection(body, 'Rituals');
    renderItemCards(cardsEl, rituals, { ...ctx, compendium, onPreview, onActivateSlot, onActivateRitualSlot });
  }

  if (!powers.length && !feats.length && !rituals.length) {
    body.innerHTML =
      '<p class="character-collection-empty text-sm text-slate-400 m-0">Selections from race, class, feats, and powers will appear here.</p>';
  }
}

/**
 * @param {HTMLElement} panelRoot
 */
export function initCharacterCollectionPanel(panelRoot) {
  if (!panelRoot || panelRoot.dataset.collectionInit) return panelRoot;
  panelRoot.dataset.collectionInit = 'true';

  const toggle = panelRoot.querySelector('.character-collection-toggle');
  const body = panelRoot.querySelector('.character-collection-body');

  if (toggle && !toggle.querySelector('.sheet-mirror-chevron')) {
    toggle.insertAdjacentHTML('afterbegin', COLLAPSIBLE_CHEVRON_SVG);
  }

  const updateToggleLabel = (collapsed) => {
    if (!toggle) return;
    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    toggle.setAttribute(
      'aria-label',
      collapsed ? 'Expand character collection' : 'Collapse character collection'
    );
  };

  toggle?.addEventListener('click', () => {
    const collapsed = panelRoot.classList.toggle('character-collection-panel--collapsed');
    body?.classList.toggle('character-collection-body--collapsed', collapsed);
    updateToggleLabel(collapsed);
  });

  updateToggleLabel(panelRoot.classList.contains('character-collection-panel--collapsed'));

  return panelRoot;
}
