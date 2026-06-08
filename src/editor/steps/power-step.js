import {
  getPowerSlotsForLevel,
  groupPowerSlotsByType,
  setPowerForSlot,
  countFilledPowerSlots,
  syncPowerNotesFromSelections,
  ensurePowerSelectionsShape,
  migratePowerIdsToSelections,
  POWER_TYPE_ORDER
} from '../../character/power-selections.js';
import {
  buildPowerEligibilityContext,
  filterPowerEntries,
  formatPowerListingMeta
} from '../power-filter.js';
import {
  renderComboboxHtml,
  attachComboboxBehavior,
  renderPickerOptions,
  setComboboxInputFromEntry,
  showIdleHint,
  showEmptyHint,
  COMPENDIUM_SEARCH_MIN
} from '../picker/combobox-picker.js';
import {
  renderPowerCollectionPanel,
  loadUniversalActionsMeta
} from './power-collection-panel.js';
import { escapeHtml as esc } from '../../shared/escape-html.js';
import { pickerCardClass } from '../picker/picker-card.js';

const LIST_CAP = 100;
const ELIGIBLE_FETCH_LIMIT = 500;
const SHOW_ALL_LIMIT = 3500;

/** @type {Map<string, { entries: object[], at: number }>} */
const showAllCache = new Map();

/**
 * @param {HTMLElement} panel
 * @param {object} ctx
 */
export async function renderPowerStep(panel, ctx) {
  const { character, compendium, onPersist, renderTutorHint } = ctx;

  ensurePowerSelectionsShape(character);
  migratePowerIdsToSelections(character);

  const classId = character.selections?.classId;

  if (!classId) {
    panel.innerHTML = `
      <section class="power-slots-section" aria-label="Powers">
        <h3 class="tutor-bonuses-title">Powers</h3>
        <p class="feat-step-hint">
          Complete the <strong>Class</strong> step before choosing powers.
        </p>
      </section>`;
    renderTutorHint?.(panel);
    return;
  }

  const level = character.identity?.level ?? 1;
  const slots = getPowerSlotsForLevel(level);
  const grouped = groupPowerSlotsByType(slots);
  const filled = countFilledPowerSlots(character);
  const universalMeta = await loadUniversalActionsMeta();

  let showAllPowers = false;
  let enforcePrerequisites = true;
  let activeSlotId = slots.find((s) => !character.selections.powerSelections?.[s.id])?.id ?? slots[0]?.id ?? null;

  const slotListHtml = POWER_TYPE_ORDER.map((type) => {
    const typeSlots = grouped[type];
    if (!typeSlots?.length) return '';
    const rows = typeSlots
      .map((slot) => {
        const isActive = slot.id === activeSlotId;
        return `
          <button type="button" class="${pickerCardClass(isActive)} power-slot-row" data-slot-id="${esc(slot.id)}">
            <span class="block">${esc(slot.label)}</span>
            <span class="block text-sm font-normal text-slate-400 power-slot-row-meta">Empty — click to choose</span>
          </button>`;
      })
      .join('');
    return `
      <div class="power-type-section" data-power-type="${esc(type)}">
        <h4 class="power-type-heading">${esc(type)}</h4>
        <div class="flex flex-col gap-2 w-full">${rows}</div>
      </div>`;
  }).join('');

  panel.innerHTML = `
    <section class="power-slots-section" aria-label="Powers">
      <h3 class="tutor-bonuses-title">Powers</h3>
      <p class="skill-train-quota">
        Choose <strong>${slots.length}</strong> class power${slots.length === 1 ? '' : 's'} for your level.
        <span class="meta" id="power-slot-quota">(${filled} / ${slots.length} filled)</span>
      </p>
      <p class="feat-step-hint">
        You can replace any class power by selecting its slot and picking a different one
        (same type, level ≤ character level, prerequisites met). Type at least ${COMPENDIUM_SEARCH_MIN} letters to search.
      </p>
      <div class="feat-step-toolbar">
        <label class="feat-show-all">
          <input type="checkbox" id="power-enforce-prereq" checked />
          <span>Only powers with prerequisites met</span>
        </label>
        <label class="feat-show-all power-show-all-label">
          <input type="checkbox" id="power-show-all" />
          <span>Show all powers</span>
          <span class="power-filter-warning" id="power-warn-icon" hidden title="Loads a very large compendium list. First open may take several seconds." aria-label="Warning: loading all powers may be slow">⚠</span>
        </label>
        <p class="feat-show-all-hint" id="power-show-all-hint" hidden>
          Loads very many entries — the first open may take several seconds.
        </p>
        <p class="feat-filter-status" id="power-filter-status"></p>
      </div>
      <div class="power-step-layout">
        <div class="power-step-picker-col">
          <div class="compendium-picker">
            <div class="picker-toolbar">
              <span class="power-step-panel-label">Class power slots</span>
            </div>
            <div id="power-slot-list" class="power-slot-list-compact">${slotListHtml}</div>
          </div>
          <div class="compendium-picker">
            <div class="picker-toolbar">
              <span class="power-step-panel-label">Search powers</span>
            </div>
            <div id="power-shared-picker" class="power-shared-picker"></div>
          </div>
        </div>
        <aside class="compendium-picker power-step-collection-col" id="power-collection-root" aria-label="Your powers">
          <div class="picker-toolbar">
            <span class="power-step-panel-label">Your powers</span>
          </div>
          <div class="power-collection-body" id="power-collection-body"></div>
        </aside>
      </div>
      <div class="compendium-picker power-preview-panel">
        <div class="picker-toolbar">
          <span class="power-step-panel-label">Compendium preview</span>
        </div>
        <div class="entry-preview power-collection-preview" id="power-collection-preview"></div>
      </div>
    </section>`;

  const pickerCol = panel.querySelector('#power-shared-picker');
  const collectionRoot = panel.querySelector('#power-collection-body');
  const collectionPreview = panel.querySelector('#power-collection-preview');
  const enforceCheckbox = panel.querySelector('#power-enforce-prereq');
  const showAllCheckbox = panel.querySelector('#power-show-all');
  const showAllHint = panel.querySelector('#power-show-all-hint');
  const warnIcon = panel.querySelector('#power-warn-icon');
  const filterStatus = panel.querySelector('#power-filter-status');
  const quotaEl = panel.querySelector('#power-slot-quota');

  const inputId = 'picker-power-shared';
  const listboxId = 'picker-listbox-power-shared';
  pickerCol.innerHTML = renderComboboxHtml({
    inputId,
    listboxId,
    placeholder: 'Select a power for the active slot',
    visibleLabel: 'Power picker'
  });

  const input = pickerCol.querySelector(`#${inputId}`);
  const listbox = pickerCol.querySelector(`#${listboxId}`);

  function getActiveSlot() {
    return slots.find((s) => s.id === activeSlotId) ?? null;
  }

  function isRetrain(slot) {
    return !!character.selections.powerSelections?.[slot.id];
  }

  function updateQuota() {
    if (quotaEl) {
      const n = countFilledPowerSlots(character);
      quotaEl.textContent = `(${n} / ${slots.length} filled)`;
    }
  }

  function updateSlotListUi() {
    panel.querySelectorAll('.power-slot-row').forEach((row) => {
      const sid = row.dataset.slotId;
      const pid = character.selections.powerSelections?.[sid];
      const isActive = sid === activeSlotId;
      row.classList.remove('ring-2', 'ring-amber-500/80');
      if (isActive) row.classList.add('ring-2', 'ring-amber-500/80');
    });
  }

  async function refreshSlotLabels() {
    const rows = panel.querySelectorAll('.power-slot-row');
    await Promise.all(
      [...rows].map(async (row) => {
        const sid = row.dataset.slotId;
        const pid = character.selections.powerSelections?.[sid];
        const metaEl = row.querySelector('.power-slot-row-meta');
        if (!metaEl) return;
        if (!pid) {
          metaEl.textContent = 'Empty — click to choose';
          return;
        }
        const entry = await compendium.getEntry(pid);
        metaEl.textContent = entry?.listing_fields?.Name ?? 'Selected';
      })
    );
  }

  function updateFilterStatus(count) {
    if (!filterStatus) return;
    if (showAllPowers) {
      filterStatus.textContent = count != null ? `Showing all powers (${count} loaded).` : 'Loading all powers…';
    } else if (enforcePrerequisites) {
      filterStatus.textContent =
        count != null ? `Showing eligible powers (${count} matches).` : 'Showing eligible powers only.';
    } else {
      filterStatus.textContent =
        count != null ? `Showing class powers (${count} matches).` : 'Showing class powers only.';
    }
  }

  async function loadPowerPool(slot, query = '') {
    const q = query.trim();
    const ctxBase = await buildPowerEligibilityContext(character, compendium);
    const cacheKey = `${showAllPowers}|${enforcePrerequisites}|${slot.id}|${q}|${ctxBase.className}|${isRetrain(slot)}`;

    if (showAllPowers && !q) {
      const cached = showAllCache.get(cacheKey);
      if (cached) return cached.entries;
    }

    const limit = showAllPowers ? SHOW_ALL_LIMIT : ELIGIBLE_FETCH_LIMIT;
    const listOpts = {
      search: q.length >= COMPENDIUM_SEARCH_MIN ? q : '',
      limit,
      powerType: slot.powerType
    };

    if (!showAllPowers) {
      listOpts.level = slot.slotLevel;
      if (ctxBase.className) listOpts.className = ctxBase.className;
    }

    const entries = await compendium.listEntries('power', listOpts);

    if (showAllPowers && !q) {
      showAllCache.set(cacheKey, { entries, at: Date.now() });
    }

    return entries;
  }

  async function refreshCollection() {
    await renderPowerCollectionPanel(collectionRoot, {
      character,
      compendium,
      slots,
      activeSlotId,
      universalMeta,
      onPreview: (entry) => {
        if (entry) collectionPreview.innerHTML = entry.body_html ?? '';
      },
      onActivateSlot: async (slotId) => {
        activeSlotId = slotId;
        updateSlotListUi();
        await syncPickerFromSlot();
        await refreshPicker(input?.value ?? '');
      }
    });
  }

  async function syncPickerFromSlot() {
    const slot = getActiveSlot();
    if (!slot || !input) return;
    const pid = character.selections.powerSelections?.[slot.id];
    if (pid) {
      await setComboboxInputFromEntry(input, compendium, pid);
    } else {
      input.value = '';
    }
  }

  async function refreshPicker(query = '') {
    const slot = getActiveSlot();
    if (!slot || !listbox) return;

    const selectedId = character.selections.powerSelections?.[slot.id] ?? null;
    const excludeIds = new Set();
    for (const [sid, pid] of Object.entries(character.selections.powerSelections ?? {})) {
      if (pid && sid !== slot.id) excludeIds.add(pid);
    }

    const ctxElig = await buildPowerEligibilityContext(character, compendium);
    const pool = await loadPowerPool(slot, query);
    const filtered = filterPowerEntries(pool, ctxElig, slot, {
      showAll: showAllPowers,
      enforcePrerequisites,
      retrain: isRetrain(slot),
      excludeIds,
      query
    });

    const shown = filtered.slice(0, LIST_CAP);
    updateFilterStatus(filtered.length);

    if (!shown.length) {
      if (query.length > 0 && query.length < COMPENDIUM_SEARCH_MIN) {
        showIdleHint(listbox, 'power');
      } else {
        showEmptyHint(
          listbox,
          showAllPowers
            ? 'No matching powers.'
            : 'No eligible powers for this slot. Try Show all powers or adjust filters.'
        );
      }
      return;
    }

    renderPickerOptions(
      listbox,
      shown,
      selectedId,
      async (id, btn) => {
        const entry = await compendium.getEntry(id);
        if (!entry) return;

        setPowerForSlot(character, slot.id, id);
        const names = { [id]: entry.listing_fields?.Name ?? id };
        syncPowerNotesFromSelections(character, names);
        await onPersist();

        input.value = entry.listing_fields?.Name ?? id;
        combobox.closeDropdown();
        btn.classList.add('picker-option--selected');
        btn.setAttribute('aria-selected', 'true');
        updateQuota();
        updateSlotListUi();
        await refreshSlotLabels();
        await refreshCollection();
        collectionPreview.innerHTML = entry.body_html ?? '';
      },
      (e) => formatPowerListingMeta(e.listing_fields)
    );
  }

  const combobox = attachComboboxBehavior(input, listbox, (q) => refreshPicker(q));

  panel.querySelectorAll('.power-slot-row').forEach((row) => {
    row.addEventListener('click', async () => {
      activeSlotId = row.dataset.slotId;
      updateSlotListUi();
      await syncPickerFromSlot();
      await refreshPicker(input?.value ?? '');
      await refreshCollection();
    });
  });

  enforceCheckbox?.addEventListener('change', () => {
    enforcePrerequisites = enforceCheckbox.checked;
    if (enforcePrerequisites) showAllCheckbox.checked = false;
    showAllPowers = showAllCheckbox?.checked ?? false;
    showAllHint.hidden = !showAllPowers;
    warnIcon.hidden = !showAllPowers;
    showAllCache.clear();
    refreshPicker(input?.value ?? '');
  });

  showAllCheckbox?.addEventListener('change', () => {
    showAllPowers = showAllCheckbox.checked;
    if (showAllPowers) {
      enforceCheckbox.checked = false;
      enforcePrerequisites = false;
    }
    showAllHint.hidden = !showAllPowers;
    warnIcon.hidden = !showAllPowers;
    showAllCache.clear();
    refreshPicker(input?.value ?? '');
  });

  updateSlotListUi();
  await refreshSlotLabels();
  await syncPickerFromSlot();
  await refreshPicker('');
  await refreshCollection();

  renderTutorHint?.(panel);
  updateFilterStatus(null);
}
