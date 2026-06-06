import { POWER_TYPE_ORDER } from '../../character/power-selections.js';
import { formatPowerListingMeta } from '../power-filter.js';
import { escapeHtml as esc } from '../../shared/escape-html.js';

/** @type {object | null} */
let universalActionsCache = null;

/**
 * @returns {Promise<object>}
 */
export async function loadUniversalActionsMeta() {
  if (universalActionsCache) return universalActionsCache;
  try {
    const res = await fetch('../../metadata/universal-actions.json');
    if (res.ok) {
      universalActionsCache = await res.json();
      return universalActionsCache;
    }
  } catch {
    /* offline fallback below */
  }
  universalActionsCache = { groups: [], resolved: [] };
  return universalActionsCache;
}

/**
 * @param {string} html
 * @returns {string[]}
 */
function extractPowerIdsFromHtml(html) {
  const ids = new Set();
  const re = /\b(power\d+)\b/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    ids.add(m[1].toLowerCase());
  }
  return [...ids];
}

/**
 * @param {import('../../character/model.js').Character} character
 * @param {import('../../data/compendium.js').CompendiumProvider} compendium
 * @returns {Promise<string[]>}
 */
async function resolveBackgroundPowerIds(character, compendium) {
  const bgId = character.selections?.backgroundId;
  if (!bgId) return [];
  const entry = await compendium.getEntry(bgId);
  if (!entry) return [];
  return extractPowerIdsFromHtml(entry.body_html ?? '');
}

/**
 * @param {string} name
 * @param {Record<string, string> | undefined} fields
 */
function formatGlossaryMeta(fields) {
  const parts = [];
  if (fields?.Type) parts.push(fields.Type);
  if (fields?.SourceBook) parts.push(fields.SourceBook);
  return parts.join(' · ') || 'Glossary';
}

/**
 * @param {HTMLElement} container
 * @param {object} opts
 */
function renderCardButton(container, { id, name, meta, selected, slotId, readonly }) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `picker-btn power-collection-card w-full min-h-11 rounded-lg border border-slate-600 bg-slate-800 px-4 py-3 text-left text-base font-medium text-slate-100 hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500${selected ? ' ring-2 ring-amber-500/80' : ''}`;
  btn.dataset.id = id;
  if (slotId) btn.dataset.slotId = slotId;
  if (readonly) btn.dataset.readonly = 'true';
  btn.innerHTML = `
    <span class="block">${esc(name)}</span>
    <span class="block text-sm font-normal text-slate-400">${esc(meta)}</span>`;
  container.appendChild(btn);
  return btn;
}

/**
 * @param {HTMLElement} parent
 * @param {string} title
 * @param {string} [note]
 */
function renderGroup(parent, title, note) {
  const group = document.createElement('div');
  group.className = 'power-collection-group';
  group.innerHTML = `
    <h4 class="power-collection-group-title">${esc(title)}</h4>
    ${note ? `<p class="power-collection-group-note">${esc(note)}</p>` : ''}
    <div class="power-collection-cards flex flex-col gap-2"></div>`;
  parent.appendChild(group);
  return group.querySelector('.power-collection-cards');
}

/**
 * @param {HTMLElement} root
 * @param {object} ctx
 */
export async function renderPowerCollectionPanel(root, ctx) {
  const {
    character,
    compendium,
    slots,
    activeSlotId,
    universalMeta,
    onPreview,
    onActivateSlot
  } = ctx;

  root.innerHTML = '';
  const selections = character.selections?.powerSelections ?? {};
  const racePowerIds = Array.isArray(character.selections?.racePowerIds)
    ? character.selections.racePowerIds
    : [];

  const meta = universalMeta ?? (await loadUniversalActionsMeta());
  const resolved = Array.isArray(meta.resolved) ? meta.resolved : [];
  const groups = Array.isArray(meta.groups) ? meta.groups : [];

  for (const group of groups) {
    const groupResolved = resolved.filter((r) => r.groupId === group.id);
    if (!groupResolved.length) continue;
    const cardsEl = renderGroup(root, group.label);
    for (const item of groupResolved) {
      const entry = await compendium.getEntry(item.id);
      const name = entry?.listing_fields?.Name ?? item.name ?? item.id;
      const cardMeta = formatGlossaryMeta(entry?.listing_fields);
      const btn = renderCardButton(cardsEl, {
        id: item.id,
        name,
        meta: cardMeta,
        readonly: true
      });
      btn.addEventListener('click', async () => {
        const e = await compendium.getEntry(item.id);
        onPreview?.(e);
        cardsEl.parentElement?.parentElement
          ?.querySelectorAll('.power-collection-card')
          .forEach((b) => b.classList.remove('ring-2', 'ring-amber-500/80'));
        btn.classList.add('ring-2', 'ring-amber-500/80');
      });
    }
  }

  if (racePowerIds.length) {
    const cardsEl = renderGroup(
      root,
      'Racial powers',
      'From race — do not use class power slots.'
    );
    for (const pid of racePowerIds) {
      const entry = await compendium.getEntry(pid);
      if (!entry) continue;
      const name = entry.listing_fields?.Name ?? pid;
      const btn = renderCardButton(cardsEl, {
        id: pid,
        name,
        meta: formatPowerListingMeta(entry.listing_fields),
        readonly: true
      });
      btn.addEventListener('click', async () => {
        onPreview?.(entry);
      });
    }
  }

  const bgPowerIds = await resolveBackgroundPowerIds(character, compendium);
  if (bgPowerIds.length) {
    const cardsEl = renderGroup(root, 'Background powers');
    for (const pid of bgPowerIds) {
      const entry = await compendium.getEntry(pid);
      if (!entry) continue;
      const name = entry.listing_fields?.Name ?? pid;
      const btn = renderCardButton(cardsEl, {
        id: pid,
        name,
        meta: formatPowerListingMeta(entry.listing_fields),
        readonly: true
      });
      btn.addEventListener('click', async () => {
        onPreview?.(entry);
      });
    }
  }

  const filledByType = Object.fromEntries(POWER_TYPE_ORDER.map((t) => [t, []]));
  for (const slot of slots) {
    const pid = selections[slot.id];
    if (pid) filledByType[slot.powerType]?.push({ slot, pid });
  }

  for (const type of POWER_TYPE_ORDER) {
    const items = filledByType[type];
    if (!items?.length) continue;
    const cardsEl = renderGroup(root, `Class — ${type}`);
    for (const { slot, pid } of items) {
      const entry = await compendium.getEntry(pid);
      const name = entry?.listing_fields?.Name ?? pid;
      const isActive = slot.id === activeSlotId;
      const btn = renderCardButton(cardsEl, {
        id: pid,
        name,
        meta: `${slot.label} · ${formatPowerListingMeta(entry?.listing_fields)}`,
        selected: isActive,
        slotId: slot.id
      });
      btn.addEventListener('click', async () => {
        onActivateSlot?.(slot.id);
        const e = await compendium.getEntry(pid);
        onPreview?.(e);
      });
    }
  }
}
