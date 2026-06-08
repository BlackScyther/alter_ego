import {
  getFeatSlotsForLevel,
  setFeatForSlot,
  countFilledFeatSlots,
  syncFeatNotesFromSelections,
  ensureFeatSelectionsShape,
  migrateFeatIdsToSelections
} from '../../character/feat-selections.js';
import {
  buildFeatEligibilityContext,
  filterFeatEntries,
  formatFeatListingMeta
} from '../feat-prerequisite.js';
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

const PICKER_KEY = 'feats';
const LIST_CAP = 100;
const ELIGIBLE_FETCH_LIMIT = 500;
const SHOW_ALL_LIMIT = 3500;

/** @type {Map<string, { entries: object[], at: number }>} */
const showAllCache = new Map();

/**
 * @param {HTMLElement} panel
 * @param {object} ctx
 */
export async function renderFeatStep(panel, ctx) {
  const { character, compendium, def, onPersist, refreshBonuses, renderTutorHint } = ctx;

  ensureFeatSelectionsShape(character);
  migrateFeatIdsToSelections(character);

  const level = character.identity?.level ?? 1;
  const slots = getFeatSlotsForLevel(level);
  const filled = countFilledFeatSlots(character);
  const filters = Array.isArray(def.filters) ? def.filters : [];

  let showAllFeats = false;

  panel.innerHTML = `
    <section class="power-slots-section" aria-label="Feats">
      <h3 class="tutor-bonuses-title">Feats</h3>
      <p class="skill-train-quota">
        Choose <strong>${slots.length}</strong> feat${slots.length === 1 ? '' : 's'} for your level.
        <span class="meta">(${filled} / ${slots.length} filled)</span>
      </p>
      <p class="feat-step-hint">
        You can change any earlier feat by picking a different one in its slot. Type at least ${COMPENDIUM_SEARCH_MIN} letters to search.
      </p>
      <div class="feat-step-toolbar">
        ${filters.length ? renderSourceFiltersHtml(PICKER_KEY, filters) : ''}
        <label class="feat-show-all">
          <input type="checkbox" id="feat-show-all" />
          <span>Show all feats</span>
        </label>
        <p class="feat-show-all-hint" id="feat-show-all-hint" hidden>
          Loads the full compendium list (~3,000 feats). First open may take a few seconds.
        </p>
        <p class="feat-filter-status" id="feat-filter-status"></p>
      </div>
      <div id="feat-slot-list" class="power-slot-list"></div>
    </section>`;

  const slotList = panel.querySelector('#feat-slot-list');
  const showAllCheckbox = panel.querySelector('#feat-show-all');
  const showAllHint = panel.querySelector('#feat-show-all-hint');
  const filterStatus = panel.querySelector('#feat-filter-status');

  function updateFilterStatus(count) {
    if (!filterStatus) return;
    if (showAllFeats) {
      filterStatus.textContent = count != null ? `Showing all feats (${count} loaded).` : 'Loading all feats…';
    } else {
      filterStatus.textContent =
        count != null ? `Showing eligible feats only (${count} matches).` : 'Showing eligible feats only.';
    }
  }

  async function loadFeatPool(query = '') {
    const sourceBooks = filters.length ? getActiveSourceBooks(PICKER_KEY, filters) : null;
    const q = query.trim();
    const cacheKey = `${showAllFeats}|${(sourceBooks ?? []).join(',')}|${q}`;

    if (showAllFeats && !q) {
      const cached = showAllCache.get(cacheKey);
      if (cached) return cached.entries;
    }

    const limit = showAllFeats ? SHOW_ALL_LIMIT : ELIGIBLE_FETCH_LIMIT;
    const entries = await compendium.listEntries('feat', {
      search: q.length >= COMPENDIUM_SEARCH_MIN ? q : '',
      limit,
      sourceBooks: sourceBooks ?? undefined
    });

    if (showAllFeats && !q) {
      showAllCache.set(cacheKey, { entries, at: Date.now() });
    }

    return entries;
  }

  async function refreshSlot(slot, slotEl, query = '') {
    const input = slotEl.querySelector('.picker-combobox-input');
    const listbox = slotEl.querySelector('.picker-dropdown');
    const preview = slotEl.querySelector('.entry-preview');
    const selectedId = character.selections.featSelections?.[slot.id] ?? null;

    const excludeIds = new Set();
    for (const [sid, fid] of Object.entries(character.selections.featSelections ?? {})) {
      if (fid && sid !== slot.id) excludeIds.add(fid);
    }

    const ctxElig = await buildFeatEligibilityContext(character, compendium, slot);
    const pool = await loadFeatPool(query);
    const filtered = filterFeatEntries(pool, ctxElig, slot, {
      showAll: showAllFeats,
      excludeIds,
      query
    });

    const shown = filtered.slice(0, LIST_CAP);
    updateFilterStatus(filtered.length);

    if (!shown.length) {
      if (query.length > 0 && query.length < COMPENDIUM_SEARCH_MIN) {
        showIdleHint(listbox, 'feat');
      } else {
        showEmptyHint(listbox, showAllFeats ? 'No matching feats.' : 'No eligible feats. Try Show all feats or adjust your search.');
      }
      return;
    }

    renderPickerOptions(listbox, shown, selectedId, async (id, btn) => {
      const entry = await compendium.getEntry(id);
      if (!entry) return;

      setFeatForSlot(character, slot.id, id);
      const names = { [id]: entry.listing_fields?.Name ?? id };
      syncFeatNotesFromSelections(character, names);
      await refreshBonuses();
      await onPersist();

      input.value = entry.listing_fields?.Name ?? id;
      combobox.closeDropdown();
      preview.innerHTML = entry.body_html ?? '';
      btn.classList.add('picker-option--selected');
      btn.setAttribute('aria-selected', 'true');

      const quota = panel.querySelector('.skill-train-quota .meta');
      if (quota) {
        const n = countFilledFeatSlots(character);
        quota.textContent = `(${n} / ${slots.length} filled)`;
      }
    }, (e) => formatFeatListingMeta(e.listing_fields));
  }

  for (const slot of slots) {
    const safeId = slot.id.replace(/[^a-z0-9-]/gi, '-');
    const inputId = `picker-feat-${safeId}`;
    const listboxId = `picker-listbox-feat-${safeId}`;
    const previewId = `entry-preview-feat-${safeId}`;

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

    slotList.appendChild(slotEl);

    const input = slotEl.querySelector(`#${inputId}`);
    const listbox = slotEl.querySelector(`#${listboxId}`);
    const preview = slotEl.querySelector(`#${previewId}`);

    const combobox = attachComboboxBehavior(input, listbox, (q) => refreshSlot(slot, slotEl, q));

    slotEl.querySelector('.feat-slot-clear')?.addEventListener('click', async () => {
      setFeatForSlot(character, slot.id, null);
      syncFeatNotesFromSelections(character);
      input.value = '';
      preview.innerHTML = '';
      await refreshBonuses();
      await onPersist();
      await refreshSlot(slot, slotEl, input.value);
    });

    const existingId = character.selections.featSelections?.[slot.id];
    if (existingId) {
      await setComboboxInputFromEntry(input, compendium, existingId);
      const entry = await compendium.getEntry(existingId);
      if (entry) preview.innerHTML = entry.body_html ?? '';
    }

    await refreshSlot(slot, slotEl, '');
  }

  if (filters.length) {
    attachSourceFilters(panel, PICKER_KEY, filters, () => {
      showAllCache.clear();
      slotList.querySelectorAll('.power-slot').forEach((slotEl) => {
        const slotId = slotEl.dataset.slotId;
        const slot = slots.find((s) => s.id === slotId);
        if (!slot) return;
        const input = slotEl.querySelector('.picker-combobox-input');
        refreshSlot(slot, slotEl, input?.value ?? '');
      });
    });
  }

  showAllCheckbox?.addEventListener('change', () => {
    showAllFeats = showAllCheckbox.checked;
    showAllHint.hidden = !showAllFeats;
    showAllCache.clear();
    slotList.querySelectorAll('.power-slot').forEach((slotEl) => {
      const slotId = slotEl.dataset.slotId;
      const slot = slots.find((s) => s.id === slotId);
      if (!slot) return;
      const input = slotEl.querySelector('.picker-combobox-input');
      refreshSlot(slot, slotEl, input?.value ?? '');
    });
  });

  renderTutorHint?.(panel);
  updateFilterStatus(null);
}
