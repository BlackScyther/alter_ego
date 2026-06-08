import { compendium } from '../data/compendium.js';
import { escapeHtml } from '../shared/escape-html.js';

/** @type {Map<string, object>} */
const entryCache = new Map();
/** @type {HTMLElement | null} */
let cardEl = null;
/** @type {HTMLElement | null} */
let activeLink = null;
let hideTimer = null;

const CATEGORY_LABELS = {
  glossary: 'Glossary',
  feat: 'Feat',
  power: 'Power',
  race: 'Race',
  class: 'Class',
  background: 'Background',
  theme: 'Theme',
  paragonpath: 'Paragon Path',
  epicdestiny: 'Epic Destiny',
  disease: 'Disease',
  poison: 'Poison'
};

function ensureCard() {
  if (cardEl) return cardEl;
  cardEl = document.createElement('div');
  cardEl.id = 'compendium-hover-card';
  cardEl.className = 'compendium-hover-card hidden';
  cardEl.setAttribute('role', 'tooltip');
  cardEl.innerHTML = `
    <div class="compendium-hover-card__header"></div>
    <div class="compendium-hover-card__body"></div>`;
  document.body.appendChild(cardEl);
  return cardEl;
}

async function loadEntry(id) {
  if (entryCache.has(id)) return entryCache.get(id);
  const entry = await compendium.getEntry(id);
  if (entry) entryCache.set(id, entry);
  return entry;
}

function positionCard(link) {
  const card = ensureCard();
  const rect = link.getBoundingClientRect();
  const margin = 8;
  let top = rect.bottom + margin;
  let left = rect.left;
  card.classList.remove('hidden');
  const cardRect = card.getBoundingClientRect();
  if (top + cardRect.height > window.innerHeight - margin) {
    top = rect.top - cardRect.height - margin;
  }
  if (left + cardRect.width > window.innerWidth - margin) {
    left = window.innerWidth - cardRect.width - margin;
  }
  card.style.top = `${Math.max(margin, top)}px`;
  card.style.left = `${Math.max(margin, left)}px`;
}

async function showCard(link) {
  clearTimeout(hideTimer);
  activeLink = link;
  const id = link.dataset.entryId;
  if (!id) return;
  const entry = await loadEntry(id);
  if (!entry || activeLink !== link) return;
  const card = ensureCard();
  const cat = CATEGORY_LABELS[entry.category_slug] ?? entry.category_slug ?? 'Entry';
  const name = entry.listing_fields?.Name ?? entry.id;
  card.querySelector('.compendium-hover-card__header').innerHTML =
    `<span class="compendium-hover-card__cat">${escapeHtml(cat)}</span><strong>${escapeHtml(name)}</strong>`;
  card.querySelector('.compendium-hover-card__body').innerHTML = entry.body_html ?? '';
  positionCard(link);
}

function hideCard() {
  hideTimer = setTimeout(() => {
    activeLink = null;
    cardEl?.classList.add('hidden');
  }, 80);
}

function findCompLink(target, root) {
  return target?.closest?.('.comp-link');
}

/**
 * @param {ParentNode} [root]
 */
export function attachCompendiumHoverDelegates(root = document) {
  if (root._compLinkDelegates) return;
  root._compLinkDelegates = true;
  root.addEventListener(
    'mouseover',
    (e) => {
      const link = findCompLink(e.target, root);
      if (link) showCard(link);
    },
    true
  );
  root.addEventListener(
    'mouseout',
    (e) => {
      const link = findCompLink(e.target, root);
      if (!link) return;
      const related = e.relatedTarget;
      if (related && link.contains(related)) return;
      if (activeLink === link) hideCard();
    },
    true
  );
  root.addEventListener(
    'focusin',
    (e) => {
      const link = findCompLink(e.target, root);
      if (link) showCard(link);
    },
    true
  );
  root.addEventListener(
    'focusout',
    (e) => {
      const link = findCompLink(e.target, root);
      if (link && activeLink === link) hideCard();
    },
    true
  );
}

export function clearCompendiumEntryCache() {
  entryCache.clear();
}
