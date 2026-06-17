import {
  EQUIPMENT_SLOT_GROUP_ORDER,
  EQUIPMENT_SLOTS,
  ensureEquipmentSelectionsShape,
  migrateEquipmentIdsToItems,
  groupEquipmentSlotsByGroup,
  getInventoryItems,
  getEquippedBySlot,
  addEquipmentFromCompendium,
  equipItem,
  unequipSlot,
  removeInventoryItem,
  getEligibleSlotsForEntry,
  getFirstEmptyEligibleSlot,
  isEntryEligibleForSlot
} from '../../character/equipment-selections.js';
import {
  renderComboboxHtml,
  attachComboboxBehavior,
  renderPickerOptions,
  showIdleHint,
  showEmptyHint,
  COMPENDIUM_SEARCH_MIN
} from '../picker/combobox-picker.js';
import {
  renderSourceComboHtml,
  attachSourceCombo,
  getActiveSourceBooksFromCombo
} from '../picker/picker-source-combo.js';
import { escapeHtml as esc } from '../../shared/escape-html.js';
import { pickerCardClass } from '../picker/picker-card.js';
import { compendiumEntryPageUrl } from '../../ui/compendium-entry-url.js';
import { maybeSeedStartingEquipment, getRecommendedStartingKitMeta, applyStartingKit } from '../../character/starting-equipment.js';
import { syncEquipmentToSheet } from '../../character/equipment-sheet-sync.js';

const PICKER_KEY = 'equipment';

const EQUIPMENT_CATEGORIES = [
  { slug: 'weapon', label: 'Weapon' },
  { slug: 'armor', label: 'Armor' },
  { slug: 'implement', label: 'Implement' },
  { slug: 'item', label: 'Item' }
];

const LIST_CAP = 100;

/**
 * @param {Record<string, string> | undefined} fields
 */
export function formatEquipmentListingMeta(fields) {
  if (!fields) return '';
  return ['Type', 'Level', 'Cost', 'SourceBook']
    .map((k) => fields[k])
    .filter(Boolean)
    .join(' · ');
}

/**
 * @param {HTMLElement} panel
 * @param {object} ctx
 */
export async function renderEquipmentStep(panel, ctx) {
  const { character, compendium, onPersist, renderTutorHint, builderMode } = ctx;

  ensureEquipmentSelectionsShape(character);
  migrateEquipmentIdsToItems(character);

  const classId = character.selections?.classId;
  if (!classId) {
    panel.innerHTML = `
      <section class="equipment-step-section" aria-label="Equipment">
        <h3 class="tutor-bonuses-title">Equipment</h3>
        <p class="feat-step-hint">
          Complete the <strong>Class</strong> step before choosing equipment.
        </p>
      </section>`;
    renderTutorHint?.(panel);
    return;
  }

  const seeded = await maybeSeedStartingEquipment(character, compendium, { builderMode });
  if (seeded) await onPersist();

  const level = character.identity?.level ?? 1;
  const recommendedMeta = getRecommendedStartingKitMeta(character);
  const recommendedAvailable = recommendedMeta.available;
  const showRecommendRow = level === 1;
  const leftoverGoldGp = recommendedMeta.kit?.remainingGoldGp ?? 100;

  async function afterEquipmentChange() {
    const classEntry = character.selections?.classId
      ? await compendium.getEntry(character.selections.classId)
      : null;
    await syncEquipmentToSheet(character, compendium, { classEntry });
    await onPersist();
  }

  let activeCategory = 'weapon';
  let activeSlotId = EQUIPMENT_SLOTS[0]?.id ?? null;
  let selectedInventoryId = null;
  let sourceBooks = await compendium.distinctSourceBooks(activeCategory);

  const grouped = groupEquipmentSlotsByGroup();
  const inventoryCount = getInventoryItems(character).length;

  const slotListHtml = EQUIPMENT_SLOT_GROUP_ORDER.map((group) => {
    const groupSlots = grouped[group];
    if (!groupSlots?.length) return '';
    const rows = groupSlots
      .map((slot) => {
        const isActive = slot.id === activeSlotId;
        return `
          <div class="power-slot-row-wrap">
            <button type="button" class="${pickerCardClass(isActive)} power-slot-row equipment-slot-row" data-slot-id="${esc(slot.id)}">
              <span class="block">${esc(slot.label)}</span>
              <span class="block text-sm font-normal text-slate-400 power-slot-row-meta">Empty — click to choose</span>
            </button>
            <a
              class="character-collection-open power-slot-open"
              data-slot-id="${esc(slot.id)}"
              target="_blank"
              rel="noopener noreferrer"
              title="Open compendium entry in new window"
              aria-label="Open equipment in compendium"
              hidden
            >↗</a>
            <button
              type="button"
              class="power-slot-clear"
              data-slot-id="${esc(slot.id)}"
              aria-label="Unequip ${esc(slot.label)}"
              title="Unequip this slot"
              hidden
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
              </svg>
            </button>
          </div>`;
      })
      .join('');
    return `
      <div class="power-type-section" data-equipment-group="${esc(group)}">
        <h4 class="power-type-heading">${esc(group)}</h4>
        <div class="flex flex-col gap-2 w-full">${rows}</div>
      </div>`;
  }).join('');

  const categoryTabsHtml = EQUIPMENT_CATEGORIES.map(
    (cat) =>
      `<button type="button" class="equipment-category-tab${cat.slug === activeCategory ? ' equipment-category-tab--active' : ''}" data-category="${esc(cat.slug)}">${esc(cat.label)}</button>`
  ).join('');

  const goldGp = character.sheet?.treasure?.goldGp ?? 0;

  panel.innerHTML = `
    <section class="equipment-step-section" aria-label="Equipment">
      <h3 class="tutor-bonuses-title">Equipment</h3>
      ${
        showRecommendRow
          ? `
      <div class="power-step-recommend-row">
        <button
          type="button"
          id="equipment-apply-recommended"
          class="btn-secondary"
          ${recommendedAvailable ? '' : 'disabled'}
          title="${recommendedAvailable ? `Apply starter equipment for ${esc(recommendedMeta.buildLabel ?? 'your build')}` : 'No starting equipment kit for this class yet.'}"
        >
          Recommended equipment for this class
        </button>
        <p class="power-recommend-hint" id="equipment-recommend-hint">
          ${
            recommendedAvailable
              ? `Applies the ${esc(recommendedMeta.buildLabel ?? 'build')} starting kit and sets leftover gold (${leftoverGoldGp} gp).`
              : 'No class starting equipment kit yet — pick a build on the Class step when kits are available.'
          }
        </p>
      </div>`
          : ''
      }
      <p class="feat-step-hint">
        Add items from the compendium to your inventory, then equip them to body slots.
        Click an empty slot to equip directly from the picker. Type at least ${COMPENDIUM_SEARCH_MIN} letters to search.
      </p>
      <div class="equipment-gold-row">
        <label class="equipment-gold-label" for="equipment-gold-gp">
          <span>Gold (gp)</span>
          <input type="number" id="equipment-gold-gp" class="equipment-gold-input" min="0" step="1" value="${esc(String(goldGp))}" />
        </label>
      </div>
      <div class="power-step-picker-col">
        <div class="compendium-picker">
          <div class="picker-toolbar">
            <span class="power-step-panel-label">Equipped</span>
          </div>
          <div id="equipment-slot-list" class="power-slot-list-compact">${slotListHtml}</div>
          <div class="picker-toolbar equipment-inventory-toolbar">
            <span class="power-step-panel-label">Inventory</span>
            <span class="meta" id="equipment-inventory-count">(${inventoryCount} item${inventoryCount === 1 ? '' : 's'})</span>
          </div>
          <div id="equipment-inventory-list" class="equipment-inventory-list" role="list" aria-label="Inventory"></div>
        </div>
        <div class="compendium-picker">
          <div class="picker-toolbar">
            <div class="equipment-category-tabs" role="tablist" aria-label="Equipment category">${categoryTabsHtml}</div>
            <div class="picker-toolbar-row">
              ${renderSourceComboHtml({ pickerKey: PICKER_KEY, sourceBooks, groupLabel: 'Equipment source' })}
            </div>
          </div>
          <div id="equipment-shared-picker" class="power-shared-picker"></div>
        </div>
      </div>
    </section>`;

  const inventoryListEl = panel.querySelector('#equipment-inventory-list');
  const inventoryCountEl = panel.querySelector('#equipment-inventory-count');
  const goldInput = panel.querySelector('#equipment-gold-gp');
  const pickerCol = panel.querySelector('#equipment-shared-picker');
  const recommendBtn = panel.querySelector('#equipment-apply-recommended');

  async function applyRecommendedEquipment() {
    const meta = getRecommendedStartingKitMeta(character);
    if (!meta.available) return;

    const result = await applyStartingKit(character, compendium, { force: true });
    if (!result.applied) return;

    if (goldInput) {
      goldInput.value = String(character.sheet?.treasure?.goldGp ?? 0);
    }
    selectedInventoryId = null;
    updateInventoryCount();
    await refreshSlotLabels();
    await renderInventoryList();
    await onPersist();
  }

  recommendBtn?.addEventListener('click', () => applyRecommendedEquipment());

  const inputId = 'picker-equipment-shared';
  const listboxId = 'picker-listbox-equipment-shared';
  pickerCol.innerHTML = renderComboboxHtml({
    inputId,
    listboxId,
    placeholder: 'Search equipment to add',
    visibleLabel: 'Equipment picker'
  });

  const input = pickerCol.querySelector(`#${inputId}`);
  const listbox = pickerCol.querySelector(`#${listboxId}`);

  function getActiveSlot() {
    return EQUIPMENT_SLOTS.find((s) => s.id === activeSlotId) ?? null;
  }

  function updateInventoryCount() {
    const n = getInventoryItems(character).length;
    if (inventoryCountEl) {
      inventoryCountEl.textContent = `(${n} item${n === 1 ? '' : 's'})`;
    }
  }

  function updateSlotListUi() {
    panel.querySelectorAll('.equipment-slot-row').forEach((row) => {
      const sid = row.dataset.slotId;
      const isActive = sid === activeSlotId;
      row.classList.remove('ring-2', 'ring-amber-500/80');
      if (isActive) row.classList.add('ring-2', 'ring-amber-500/80');
    });
  }

  async function refreshSlotLabels() {
    const equipped = getEquippedBySlot(character);
    const rows = panel.querySelectorAll('.equipment-slot-row');
    await Promise.all(
      [...rows].map(async (row) => {
        const sid = row.dataset.slotId;
        const item = equipped[sid];
        const metaEl = row.querySelector('.power-slot-row-meta');
        const wrap = row.parentElement;
        const clearBtn = wrap?.querySelector('.power-slot-clear');
        const openLink = wrap?.querySelector('.power-slot-open');
        if (clearBtn) clearBtn.hidden = !item;
        if (openLink && !item) {
          openLink.hidden = true;
          openLink.removeAttribute('href');
        }
        if (!metaEl) return;
        if (!item) {
          metaEl.textContent = 'Empty — click to choose';
          return;
        }
        const entry = await compendium.getEntry(item.compendiumId);
        const name = entry?.listing_fields?.Name ?? 'Selected';
        const meta = formatEquipmentListingMeta(entry?.listing_fields);
        metaEl.textContent = meta ? `${name} — ${meta}` : name;
        if (openLink) {
          openLink.hidden = false;
          openLink.href = compendiumEntryPageUrl(item.compendiumId, location.pathname);
          openLink.setAttribute('aria-label', `Open ${name} in compendium`);
        }
      })
    );
  }

  async function renderInventoryList() {
    if (!inventoryListEl) return;
    const items = getInventoryItems(character);
    if (!items.length) {
      inventoryListEl.innerHTML = `<p class="equipment-inventory-empty">No items in inventory. Use the picker to add equipment.</p>`;
      return;
    }

    const rows = await Promise.all(
      items.map(async (item) => {
        const entry = await compendium.getEntry(item.compendiumId);
        const name = entry?.listing_fields?.Name ?? item.compendiumId;
        const meta = formatEquipmentListingMeta(entry?.listing_fields);
        const eligible = entry ? getEligibleSlotsForEntry(entry) : [];
        const canEquip = eligible.length > 0;
        const isSelected = item.instanceId === selectedInventoryId;
        return `
          <div class="equipment-inventory-row-wrap" role="listitem">
            <button
              type="button"
              class="${pickerCardClass(isSelected)} equipment-inventory-row"
              data-instance-id="${esc(item.instanceId)}"
            >
              <span class="block">${esc(name)}</span>
              <span class="block text-sm font-normal text-slate-400">${esc(meta || item.categorySlug)}</span>
            </button>
            <a
              class="character-collection-open equipment-inventory-open"
              href="${esc(compendiumEntryPageUrl(item.compendiumId, location.pathname))}"
              target="_blank"
              rel="noopener noreferrer"
              title="Open compendium entry in new window"
              aria-label="Open ${esc(name)} in compendium"
            >↗</a>
            ${canEquip ? `<button type="button" class="equipment-inventory-equip" data-instance-id="${esc(item.instanceId)}" title="Equip to first eligible slot" aria-label="Equip ${esc(name)}">Equip</button>` : ''}
            <button
              type="button"
              class="equipment-inventory-remove"
              data-instance-id="${esc(item.instanceId)}"
              aria-label="Remove ${esc(name)} from inventory"
              title="Remove from inventory"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
              </svg>
            </button>
          </div>`;
      })
    );
    inventoryListEl.innerHTML = rows.join('');
    bindInventoryEvents();
  }

  function bindInventoryEvents() {
    inventoryListEl?.querySelectorAll('.equipment-inventory-row').forEach((row) => {
      row.addEventListener('click', () => {
        selectedInventoryId = row.dataset.instanceId ?? null;
        renderInventoryList();
        highlightEligibleSlots();
      });
    });

    inventoryListEl?.querySelectorAll('.equipment-inventory-equip').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const instanceId = btn.dataset.instanceId;
        const item = character.selections.equipmentItems?.find((i) => i.instanceId === instanceId);
        if (!item) return;
        const entry = await compendium.getEntry(item.compendiumId);
        if (!entry) return;
        const slotId = getFirstEmptyEligibleSlot(character, entry);
        if (!slotId) return;
        equipItem(character, instanceId, slotId);
        activeSlotId = slotId;
        selectedInventoryId = null;
        await afterEquipmentChange();
        updateSlotListUi();
        await refreshSlotLabels();
        await renderInventoryList();
        updateInventoryCount();
        highlightEligibleSlots();
        await refreshPicker(input?.value ?? '');
      });
    });

    inventoryListEl?.querySelectorAll('.equipment-inventory-remove').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        removeInventoryItem(character, btn.dataset.instanceId ?? '');
        if (selectedInventoryId === btn.dataset.instanceId) selectedInventoryId = null;
        await afterEquipmentChange();
        await renderInventoryList();
        updateInventoryCount();
        highlightEligibleSlots();
      });
    });

    inventoryListEl?.querySelectorAll('.equipment-inventory-open').forEach((link) => {
      link.addEventListener('click', (e) => e.stopPropagation());
    });
  }

  function highlightEligibleSlots() {
    panel.querySelectorAll('.equipment-slot-row').forEach((row) => {
      row.classList.remove('equipment-slot-row--eligible');
    });
    if (!selectedInventoryId) return;

    const item = character.selections.equipmentItems?.find((i) => i.instanceId === selectedInventoryId);
    if (!item) return;

    compendium.getEntry(item.compendiumId).then((entry) => {
      if (!entry) return;
      const eligible = new Set(getEligibleSlotsForEntry(entry));
      panel.querySelectorAll('.equipment-slot-row').forEach((row) => {
        if (eligible.has(row.dataset.slotId ?? '')) {
          row.classList.add('equipment-slot-row--eligible');
        }
      });
    });
  }

  async function clearEquipmentSlot(slotId) {
    const equipped = getEquippedBySlot(character);
    if (!equipped[slotId]) return;

    unequipSlot(character, slotId);
    await afterEquipmentChange();
    updateSlotListUi();
    await refreshSlotLabels();
    await renderInventoryList();
    updateInventoryCount();
    highlightEligibleSlots();
    await refreshPicker(input?.value ?? '');
  }

  async function loadEquipmentPool(query = '') {
    const q = query.trim();
    const sourceBooksFilter = getActiveSourceBooksFromCombo(PICKER_KEY);
    return compendium.listEntries(activeCategory, {
      search: q.length >= COMPENDIUM_SEARCH_MIN ? q : '',
      limit: LIST_CAP,
      sourceBooks: sourceBooksFilter ?? undefined
    });
  }

  async function refreshPicker(query = '') {
    if (!listbox) return;

    const pool = await loadEquipmentPool(query);
    const activeSlot = getActiveSlot();
    const equipped = getEquippedBySlot(character);
    const slotItem = activeSlot ? equipped[activeSlot.id] : null;
    const selectedId = slotItem?.compendiumId ?? null;

    if (!pool.length) {
      if (query.length > 0 && query.length < COMPENDIUM_SEARCH_MIN) {
        showIdleHint(listbox, 'equipment');
      } else {
        showEmptyHint(listbox, 'No matching equipment for this category.');
      }
      return;
    }

    renderPickerOptions(
      listbox,
      pool,
      selectedId,
      async (id) => {
        const entry = await compendium.getEntry(id);
        if (!entry) return;

        const slot = getActiveSlot();
        const slotOccupied = slot ? equipped[slot.id] : null;
        const directEquip =
          slot && !slotOccupied && isEntryEligibleForSlot(slot.id, entry);

        if (directEquip) {
          addEquipmentFromCompendium(character, entry, slot.id);
        } else if (slot && slotOccupied && isEntryEligibleForSlot(slot.id, entry)) {
          unequipSlot(character, slot.id);
          addEquipmentFromCompendium(character, entry, slot.id);
        } else {
          addEquipmentFromCompendium(character, entry);
        }

        await afterEquipmentChange();
        combobox.commitSelection();
        input.value = entry.listing_fields?.Name ?? id;
        combobox.closeDropdown();
        updateSlotListUi();
        await refreshSlotLabels();
        await renderInventoryList();
        updateInventoryCount();
        highlightEligibleSlots();
      },
      (e) => formatEquipmentListingMeta(e.listing_fields)
    );
  }

  const combobox = attachComboboxBehavior(input, listbox, (q) => refreshPicker(q), { clearOnFocus: true });

  panel.querySelectorAll('.equipment-slot-row').forEach((row) => {
    row.addEventListener('click', async () => {
      const slotId = row.dataset.slotId ?? '';
      if (selectedInventoryId) {
        const item = character.selections.equipmentItems?.find((i) => i.instanceId === selectedInventoryId);
        if (item) {
          const entry = await compendium.getEntry(item.compendiumId);
          if (entry && isEntryEligibleForSlot(slotId, entry)) {
            equipItem(character, selectedInventoryId, slotId);
            selectedInventoryId = null;
            activeSlotId = slotId;
            await afterEquipmentChange();
            updateSlotListUi();
            await refreshSlotLabels();
            await renderInventoryList();
            updateInventoryCount();
            highlightEligibleSlots();
            await refreshPicker(input?.value ?? '');
            return;
          }
        }
      }

      activeSlotId = slotId;
      updateSlotListUi();
      await refreshPicker(input?.value ?? '');
    });
  });

  panel.querySelectorAll('.power-slot-clear').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await clearEquipmentSlot(btn.dataset.slotId ?? '');
    });
  });

  panel.querySelectorAll('.power-slot-open').forEach((link) => {
    link.addEventListener('click', (e) => e.stopPropagation());
  });

  panel.querySelectorAll('.equipment-category-tab').forEach((tab) => {
    tab.addEventListener('click', async () => {
      activeCategory = tab.dataset.category ?? 'weapon';
      panel.querySelectorAll('.equipment-category-tab').forEach((t) => {
        t.classList.toggle('equipment-category-tab--active', t.dataset.category === activeCategory);
      });
      sourceBooks = await compendium.distinctSourceBooks(activeCategory);
      const comboHost = panel.querySelector('.picker-source-combo');
      if (comboHost) {
        comboHost.outerHTML = renderSourceComboHtml({
          pickerKey: PICKER_KEY,
          sourceBooks,
          groupLabel: 'Equipment source'
        });
        attachSourceCombo(panel, PICKER_KEY, () => refreshPicker(input?.value ?? ''));
      }
      await refreshPicker(input?.value ?? '');
    });
  });

  attachSourceCombo(panel, PICKER_KEY, () => refreshPicker(input?.value ?? ''));

  goldInput?.addEventListener('input', () => {
    ensureEquipmentSelectionsShape(character);
    const val = Math.max(0, Math.floor(Number(goldInput.value) || 0));
    character.sheet.treasure.goldGp = val;
    goldInput.value = String(val);
    onPersist();
  });

  updateSlotListUi();
  await refreshSlotLabels();
  await renderInventoryList();
  await refreshPicker('');
  renderTutorHint?.(panel);
}
