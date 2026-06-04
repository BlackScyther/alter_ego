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
  renderSourceFiltersHtml,
  attachSourceFilters,
  getActiveSourceBooks
} from '../picker/picker-source-filters.js';
import { escapeHtml as esc } from '../../shared/escape-html.js';

const PICKER_KEY = 'powers';
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
  const { character, compendium, def, onPersist, renderTutorHint } = ctx;

  ensurePowerSelectionsShape(character);
  migratePowerIdsToSelections(character);

  const filters = Array.isArray(def.filters) ? def.filters : [];
  const classId = character.selections?.classId;

  if (!classId) {
    panel.innerHTML = `
      <section class="power-slots-section" aria-label="Powers">
        <h3 class="tutor-bonuses-title">Powers</h3>
        <p class="feat-step-hint" style="color:var(--editor-muted);font-size:13px">
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

  let showAllPowers = false;

  const sectionHtml = POWER_TYPE_ORDER.map((type) => {
    const typeSlots = grouped[type];
    if (!typeSlots?.length) return '';
    return `
      <div class="power-type-section" data-power-type="${esc(type)}">
        <h4 class="power-type-heading">${esc(type)}</h4>
        <div class="power-slot-list power-slot-list--type" data-type-slots="${esc(type)}"></div>
      </div>`;
  }).join('');

  panel.innerHTML = `
    <section class="power-slots-section" aria-label="Powers">
      <h3 class="tutor-bonuses-title">Powers</h3>
      <p class="skill-train-quota">
        Choose <strong>${slots.length}</strong> class power${slots.length === 1 ? '' : 's'} for your level.
        <span class="meta" id="power-slot-quota">(${filled} / ${slots.length} filled)</span>
      </p>
      <p class="feat-step-hint" style="color:var(--editor-muted);font-size:13px;margin:0 0 12px">
        Powers are filtered by your class. Type at least ${COMPENDIUM_SEARCH_MIN} letters to search.
      </p>
      <div class="feat-step-toolbar">
        ${filters.length ? renderSourceFiltersHtml(PICKER_KEY, filters) : ''}
        <label class="feat-show-all">
          <input type="checkbox" id="power-show-all" />
          <span>Show all powers</span>
        </label>
        <p class="feat-show-all-hint" id="power-show-all-hint" hidden>
          Loads a large compendium list. First open may take a few seconds.
        </p>
        <p class="feat-filter-status" id="power-filter-status"></p>
      </div>
      <div id="power-sections">${sectionHtml}</div>
    </section>`;

  const showAllCheckbox = panel.querySelector('#power-show-all');
  const showAllHint = panel.querySelector('#power-show-all-hint');
  const filterStatus = panel.querySelector('#power-filter-status');
  const quotaEl = panel.querySelector('#power-slot-quota');

  function updateQuota() {
    if (quotaEl) {
      const n = countFilledPowerSlots(character);
      quotaEl.textContent = `(${n} / ${slots.length} filled)`;
    }
  }

  function updateFilterStatus(count) {
    if (!filterStatus) return;
    if (showAllPowers) {
      filterStatus.textContent = count != null ? `Showing all powers (${count} loaded).` : 'Loading all powers…';
    } else {
      filterStatus.textContent =
        count != null ? `Showing class powers only (${count} matches).` : 'Showing class powers only.';
    }
  }

  async function loadPowerPool(slot, query = '') {
    const sourceBooks = filters.length ? getActiveSourceBooks(PICKER_KEY, filters) : null;
    const q = query.trim();
    const ctxBase = await buildPowerEligibilityContext(character, compendium);
    const cacheKey = `${showAllPowers}|${slot.id}|${(sourceBooks ?? []).join(',')}|${q}|${ctxBase.className}`;

    if (showAllPowers && !q) {
      const cached = showAllCache.get(cacheKey);
      if (cached) return cached.entries;
    }

    const limit = showAllPowers ? SHOW_ALL_LIMIT : ELIGIBLE_FETCH_LIMIT;
    const listOpts = {
      search: q.length >= COMPENDIUM_SEARCH_MIN ? q : '',
      limit,
      sourceBooks: sourceBooks ?? undefined,
      level: slot.slotLevel,
      powerType: slot.powerType
    };
    if (!showAllPowers && ctxBase.className) {
      listOpts.className = ctxBase.className;
    }

    const entries = await compendium.listEntries('power', listOpts);

    if (showAllPowers && !q) {
      showAllCache.set(cacheKey, { entries, at: Date.now() });
    }

    return entries;
  }

  async function refreshSlot(slot, slotEl, query = '') {
    const input = slotEl.querySelector('.picker-combobox-input');
    const listbox = slotEl.querySelector('.picker-dropdown');
    const preview = slotEl.querySelector('.entry-preview');
    const selectedId = character.selections.powerSelections?.[slot.id] ?? null;

    const excludeIds = new Set();
    for (const [sid, pid] of Object.entries(character.selections.powerSelections ?? {})) {
      if (pid && sid !== slot.id) excludeIds.add(pid);
    }

    const ctxElig = await buildPowerEligibilityContext(character, compendium);
    const pool = await loadPowerPool(slot, query);
    const filtered = filterPowerEntries(pool, ctxElig, slot, {
      showAll: showAllPowers,
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
            : 'No eligible powers for this slot. Try Show all powers or adjust your search.'
        );
      }
      return;
    }

    renderPickerOptions(listbox, shown, selectedId, async (id, btn) => {
      const entry = await compendium.getEntry(id);
      if (!entry) return;

      setPowerForSlot(character, slot.id, id);
      const names = { [id]: entry.listing_fields?.Name ?? id };
      syncPowerNotesFromSelections(character, names);
      await onPersist();

      input.value = entry.listing_fields?.Name ?? id;
      combobox.closeDropdown();
      preview.innerHTML = entry.body_html ?? '';
      btn.classList.add('picker-option--selected');
      btn.setAttribute('aria-selected', 'true');
      updateQuota();
    }, (e) => formatPowerListingMeta(e.listing_fields));
  }

  async function mountSlot(slot, container) {
    const safeId = slot.id.replace(/[^a-z0-9-]/gi, '-');
    const inputId = `picker-power-${safeId}`;
    const listboxId = `picker-listbox-power-${safeId}`;
    const previewId = `entry-preview-power-${safeId}`;

    const slotEl = document.createElement('div');
    slotEl.className = 'power-slot';
    slotEl.dataset.slotId = slot.id;
    slotEl.innerHTML = `
      <div class="power-slot-header">
        <span class="power-slot-label">${esc(slot.label)}</span>
        <button type="button" class="btn-secondary feat-slot-clear" data-slot-id="${esc(slot.id)}">Clear</button>
      </div>
      ${renderComboboxHtml({
        inputId,
        listboxId,
        placeholder: `Select ${slot.label}`,
        visibleLabel: slot.label
      })}
      <div class="entry-preview entry-preview--compact" id="${previewId}"></div>`;

    container.appendChild(slotEl);

    const input = slotEl.querySelector(`#${inputId}`);
    const listbox = slotEl.querySelector(`#${listboxId}`);
    const preview = slotEl.querySelector(`#${previewId}`);

    const combobox = attachComboboxBehavior(input, listbox, (q) => refreshSlot(slot, slotEl, q));

    slotEl.querySelector('.feat-slot-clear')?.addEventListener('click', async () => {
      setPowerForSlot(character, slot.id, null);
      syncPowerNotesFromSelections(character);
      input.value = '';
      preview.innerHTML = '';
      await onPersist();
      await refreshSlot(slot, slotEl, input.value);
      updateQuota();
    });

    const existingId = character.selections.powerSelections?.[slot.id];
    if (existingId) {
      await setComboboxInputFromEntry(input, compendium, existingId);
      const entry = await compendium.getEntry(existingId);
      if (entry) preview.innerHTML = entry.body_html ?? '';
    }

    await refreshSlot(slot, slotEl, '');
  }

  for (const type of POWER_TYPE_ORDER) {
    const typeSlots = grouped[type];
    if (!typeSlots?.length) continue;
    const container = panel.querySelector(`[data-type-slots="${type}"]`);
    if (!container) continue;
    for (const slot of typeSlots) {
      await mountSlot(slot, container);
    }
  }

  function refreshAllSlots() {
    panel.querySelectorAll('.power-slot').forEach((slotEl) => {
      const slotId = slotEl.dataset.slotId;
      const slot = slots.find((s) => s.id === slotId);
      if (!slot) return;
      const input = slotEl.querySelector('.picker-combobox-input');
      refreshSlot(slot, slotEl, input?.value ?? '');
    });
  }

  if (filters.length) {
    attachSourceFilters(panel, PICKER_KEY, filters, () => {
      showAllCache.clear();
      refreshAllSlots();
    });
  }

  showAllCheckbox?.addEventListener('change', () => {
    showAllPowers = showAllCheckbox.checked;
    showAllHint.hidden = !showAllPowers;
    showAllCache.clear();
    refreshAllSlots();
  });

  renderTutorHint?.(panel);
  updateFilterStatus(null);
}
