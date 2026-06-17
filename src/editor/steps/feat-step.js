import {
  getFeatSlotsForLevel,
  groupFeatSlotsByTier,
  setFeatForSlot,
  countFilledFeatSlots,
  syncFeatNotesFromSelections,
  ensureFeatSelectionsShape,
  migrateFeatIdsToSelections,
  FEAT_TIER_ORDER
} from '../../character/feat-selections.js';
import {
  applyRecommendedClassFeats,
  resolveRecommendedFeatSeeds
} from '../../character/class-selections.js';
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
  renderSourceComboHtml,
  attachSourceCombo,
  getActiveSourceBooksFromCombo
} from '../picker/picker-source-combo.js';
import { escapeHtml as esc } from '../../shared/escape-html.js';
import { pickerCardClass } from '../picker/picker-card.js';
import { compendiumEntryPageUrl } from '../../ui/compendium-entry-url.js';

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
  const { character, compendium, onPersist, refreshBonuses, onCollectionRefresh, onActiveSlotChange, renderTutorHint } =
    ctx;

  ensureFeatSelectionsShape(character);
  migrateFeatIdsToSelections(character);

  const classId = character.selections?.classId;
  const classEntry = classId ? await compendium.getEntry(classId) : null;
  const recommendedMeta = await resolveRecommendedFeatSeeds(character, classEntry, compendium);
  const recommendedAvailable = Object.keys(recommendedMeta.seeds ?? {}).length > 0;

  if (!classId) {
    panel.innerHTML = `
      <section class="power-slots-section" aria-label="Feats">
        <h3 class="tutor-bonuses-title">Feats</h3>
        <p class="feat-step-hint">
          Complete the <strong>Class</strong> step before choosing feats.
        </p>
      </section>`;
    renderTutorHint?.(panel);
    return;
  }

  const level = character.identity?.level ?? 1;
  const slots = getFeatSlotsForLevel(level);
  const grouped = groupFeatSlotsByTier(slots);
  const filled = countFilledFeatSlots(character);
  const sourceBooks = await compendium.distinctSourceBooks('feat');

  let showAllFeats = false;
  let enforcePrerequisites = true;
  let activeSlotId = slots.find((s) => !character.selections.featSelections?.[s.id])?.id ?? slots[0]?.id ?? null;

  const slotListHtml = FEAT_TIER_ORDER.map((tier) => {
    const tierSlots = grouped[tier];
    if (!tierSlots?.length) return '';
    const rows = tierSlots
      .map((slot) => {
        const isActive = slot.id === activeSlotId;
        return `
          <div class="power-slot-row-wrap">
            <button type="button" class="${pickerCardClass(isActive)} power-slot-row" data-slot-id="${esc(slot.id)}">
              <span class="block">${esc(slot.label)}</span>
              <span class="block text-sm font-normal text-slate-400 power-slot-row-meta">Empty — click to choose</span>
            </button>
            <a
              class="character-collection-open power-slot-open"
              data-slot-id="${esc(slot.id)}"
              target="_blank"
              rel="noopener noreferrer"
              title="Open compendium entry in new window"
              aria-label="Open feat in compendium"
              hidden
            >↗</a>
            <button
              type="button"
              class="power-slot-clear"
              data-slot-id="${esc(slot.id)}"
              aria-label="Clear feat from ${esc(slot.label)}"
              title="Clear this slot"
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
      <div class="power-type-section" data-feat-tier="${esc(tier)}">
        <h4 class="power-type-heading">${esc(tier)}</h4>
        <div class="flex flex-col gap-2 w-full">${rows}</div>
      </div>`;
  }).join('');

  panel.innerHTML = `
    <section class="power-slots-section" aria-label="Feats">
      <h3 class="tutor-bonuses-title">Feats</h3>
      <div class="power-step-recommend-row">
        <button
          type="button"
          id="feat-apply-recommended"
          class="btn-secondary"
          ${recommendedAvailable ? '' : 'disabled'}
          title="${recommendedAvailable ? `Apply starter feat for ${esc(recommendedMeta.buildLabel ?? 'your build')}` : 'Choose a class build with recommended feats on the Class step first.'}"
        >
          Recommended feats for this class
        </button>
        <p class="power-recommend-hint" id="feat-recommend-hint">
          ${recommendedAvailable
            ? `Applies the ${esc(recommendedMeta.buildLabel ?? 'build')} suggested level 1 feat when prerequisites are met.`
            : 'No class build feat recommendations yet — pick a build on the Class step (when available).'}
        </p>
      </div>
      <p class="skill-train-quota">
        Choose <strong>${slots.length}</strong> feat${slots.length === 1 ? '' : 's'} for your level.
        <span class="meta" id="feat-slot-quota">(${filled} / ${slots.length} filled)</span>
      </p>
      <p class="feat-step-hint">
        You can replace any feat by selecting its slot and picking a different one
        (tier and prerequisites must match the slot). Use the
        <strong>×</strong> beside a filled slot to clear it. Type at least ${COMPENDIUM_SEARCH_MIN} letters to search.
      </p>
      <div class="feat-step-toolbar">
        <label class="feat-show-all">
          <input type="checkbox" id="feat-enforce-prereq" checked />
          <span>Only feats with prerequisites met</span>
        </label>
        <label class="feat-show-all power-show-all-label">
          <input type="checkbox" id="feat-show-all" />
          <span>Show all feats</span>
          <span class="power-filter-warning" id="feat-warn-icon" hidden title="Loads a very large compendium list. First open may take several seconds." aria-label="Warning: loading all feats may be slow">⚠</span>
        </label>
        <p class="feat-show-all-hint" id="feat-show-all-hint" hidden>
          Loads the full compendium list (~3,000 feats). First open may take a few seconds.
        </p>
        <p class="feat-filter-status" id="feat-filter-status"></p>
      </div>
      <div class="power-step-picker-col">
        <div class="compendium-picker">
          <div class="picker-toolbar">
            <span class="power-step-panel-label">Feat slots</span>
          </div>
          <div id="feat-slot-list" class="power-slot-list-compact">${slotListHtml}</div>
        </div>
        <div class="compendium-picker">
          <div class="picker-toolbar">
            <div class="picker-toolbar-row">
              ${renderSourceComboHtml({ pickerKey: PICKER_KEY, sourceBooks, groupLabel: 'Feat source' })}
            </div>
          </div>
          <div id="feat-shared-picker" class="power-shared-picker"></div>
        </div>
      </div>
    </section>`;

  const pickerCol = panel.querySelector('#feat-shared-picker');
  const enforceCheckbox = panel.querySelector('#feat-enforce-prereq');
  const showAllCheckbox = panel.querySelector('#feat-show-all');
  const showAllHint = panel.querySelector('#feat-show-all-hint');
  const warnIcon = panel.querySelector('#feat-warn-icon');
  const filterStatus = panel.querySelector('#feat-filter-status');
  const quotaEl = panel.querySelector('#feat-slot-quota');
  const recommendBtn = panel.querySelector('#feat-apply-recommended');

  async function applyRecommendedFeats() {
    const meta = await resolveRecommendedFeatSeeds(character, classEntry, compendium);
    if (!classEntry || !Object.keys(meta.seeds ?? {}).length) return;

    applyRecommendedClassFeats(character, classEntry, { force: true, seeds: meta.seeds });

    const names = {};
    for (const featId of Object.values(character.selections.featSelections ?? {})) {
      if (!featId || names[featId]) continue;
      const entry = await compendium.getEntry(featId);
      names[featId] = entry?.listing_fields?.Name ?? featId;
    }
    syncFeatNotesFromSelections(character, names);
    if (refreshBonuses) await refreshBonuses();
    await onPersist();

    updateQuota();
    updateSlotListUi();
    await refreshSlotLabels();
    await syncPickerFromSlot();
    await refreshPicker('');
    await onCollectionRefresh?.();
  }

  recommendBtn?.addEventListener('click', () => applyRecommendedFeats());

  const inputId = 'picker-feat-shared';
  const listboxId = 'picker-listbox-feat-shared';
  pickerCol.innerHTML = renderComboboxHtml({
    inputId,
    listboxId,
    placeholder: 'Select a feat for the active slot',
    visibleLabel: 'Feat picker'
  });

  const input = pickerCol.querySelector(`#${inputId}`);
  const listbox = pickerCol.querySelector(`#${listboxId}`);

  function getActiveSlot() {
    return slots.find((s) => s.id === activeSlotId) ?? null;
  }

  function isRetrain(slot) {
    const filled = !!character.selections.featSelections?.[slot.id];
    return filled && (!!character.builderFlags?.retraining || filled);
  }

  function updateQuota() {
    if (quotaEl) {
      const n = countFilledFeatSlots(character);
      quotaEl.textContent = `(${n} / ${slots.length} filled)`;
    }
  }

  function updateSlotListUi() {
    panel.querySelectorAll('.power-slot-row').forEach((row) => {
      const sid = row.dataset.slotId;
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
        const fid = character.selections.featSelections?.[sid];
        const metaEl = row.querySelector('.power-slot-row-meta');
        const wrap = row.parentElement;
        const clearBtn = wrap?.querySelector('.power-slot-clear');
        const openLink = wrap?.querySelector('.power-slot-open');
        if (clearBtn) clearBtn.hidden = !fid;
        if (openLink && !fid) {
          openLink.hidden = true;
          openLink.removeAttribute('href');
        }
        if (!metaEl) return;
        if (!fid) {
          metaEl.textContent = 'Empty — click to choose';
          return;
        }
        const entry = await compendium.getEntry(fid);
        const name = entry?.listing_fields?.Name ?? 'Selected';
        metaEl.textContent = name;
        if (openLink) {
          openLink.hidden = false;
          openLink.href = compendiumEntryPageUrl(fid, location.pathname);
          openLink.setAttribute('aria-label', `Open ${name} in compendium`);
        }
      })
    );
  }

  async function clearFeatSlot(slotId) {
    if (!character.selections.featSelections?.[slotId]) return;

    setFeatForSlot(character, slotId, null);

    const names = {};
    for (const featId of Object.values(character.selections.featSelections ?? {})) {
      if (!featId || names[featId]) continue;
      const entry = await compendium.getEntry(featId);
      names[featId] = entry?.listing_fields?.Name ?? featId;
    }
    syncFeatNotesFromSelections(character, names);
    if (refreshBonuses) await refreshBonuses();
    await onPersist();

    updateQuota();
    updateSlotListUi();
    await refreshSlotLabels();

    input.value = activeSlotId === slotId ? '' : input.value;
    await refreshPicker(input?.value ?? '');

    await onCollectionRefresh?.();
  }

  function updateFilterStatus(count) {
    if (!filterStatus) return;
    if (showAllFeats) {
      filterStatus.textContent = count != null ? `Showing all feats (${count} loaded).` : 'Loading all feats…';
    } else if (enforcePrerequisites) {
      filterStatus.textContent =
        count != null ? `Showing eligible feats only (${count} matches).` : 'Showing eligible feats only.';
    } else {
      filterStatus.textContent =
        count != null ? `Showing tier-matching feats (${count} matches).` : 'Showing tier-matching feats only.';
    }
  }

  async function loadFeatPool(query = '') {
    const q = query.trim();
    const sourceBooks = getActiveSourceBooksFromCombo(PICKER_KEY);
    const cacheKey = `${showAllFeats}|${enforcePrerequisites}|${q}|${(sourceBooks ?? []).join(',')}`;

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

  async function syncPickerFromSlot() {
    const slot = getActiveSlot();
    if (!slot || !input) return;
    const fid = character.selections.featSelections?.[slot.id];
    if (fid) {
      await setComboboxInputFromEntry(input, compendium, fid);
    } else {
      input.value = '';
    }
  }

  async function refreshPicker(query = '') {
    const slot = getActiveSlot();
    if (!slot || !listbox) return;

    const selectedId = character.selections.featSelections?.[slot.id] ?? null;
    const excludeIds = new Set();
    for (const [sid, fid] of Object.entries(character.selections.featSelections ?? {})) {
      if (fid && sid !== slot.id) excludeIds.add(fid);
    }

    const ctxElig = await buildFeatEligibilityContext(character, compendium, slot);
    const pool = await loadFeatPool(query);
    const filtered = filterFeatEntries(pool, ctxElig, slot, {
      showAll: showAllFeats,
      enforcePrerequisites,
      retrain: isRetrain(slot),
      excludeIds,
      query
    });

    const shown = filtered.slice(0, LIST_CAP);
    updateFilterStatus(filtered.length);

    if (!shown.length) {
      if (query.length > 0 && query.length < COMPENDIUM_SEARCH_MIN) {
        showIdleHint(listbox, 'feat');
      } else {
        showEmptyHint(
          listbox,
          showAllFeats
            ? 'No matching feats.'
            : 'No eligible feats for this slot. Try Show all feats or adjust filters.'
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

        setFeatForSlot(character, slot.id, id);
        const names = { [id]: entry.listing_fields?.Name ?? id };
        syncFeatNotesFromSelections(character, names);
        if (refreshBonuses) await refreshBonuses();
        await onPersist();

        combobox.commitSelection();
        input.value = entry.listing_fields?.Name ?? id;
        combobox.closeDropdown();
        btn.classList.add('picker-option--selected');
        btn.setAttribute('aria-selected', 'true');
        updateQuota();
        updateSlotListUi();
        await refreshSlotLabels();
        onActiveSlotChange?.(slot.id);
        await onCollectionRefresh?.();
      },
      (e) => formatFeatListingMeta(e.listing_fields)
    );
  }

  const combobox = attachComboboxBehavior(input, listbox, (q) => refreshPicker(q), { clearOnFocus: true });

  panel.querySelectorAll('.power-slot-row').forEach((row) => {
    row.addEventListener('click', async () => {
      activeSlotId = row.dataset.slotId;
      onActiveSlotChange?.(activeSlotId);
      updateSlotListUi();
      await syncPickerFromSlot();
      await refreshPicker(input?.value ?? '');
      await onCollectionRefresh?.();
    });
  });

  panel.querySelectorAll('.power-slot-clear').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await clearFeatSlot(btn.dataset.slotId);
    });
  });

  panel.querySelectorAll('.power-slot-open').forEach((link) => {
    link.addEventListener('click', (e) => e.stopPropagation());
  });

  enforceCheckbox?.addEventListener('change', () => {
    enforcePrerequisites = enforceCheckbox.checked;
    if (enforcePrerequisites) showAllCheckbox.checked = false;
    showAllFeats = showAllCheckbox?.checked ?? false;
    showAllHint.hidden = !showAllFeats;
    warnIcon.hidden = !showAllFeats;
    showAllCache.clear();
    refreshPicker(input?.value ?? '');
  });

  showAllCheckbox?.addEventListener('change', () => {
    showAllFeats = showAllCheckbox.checked;
    if (showAllFeats) {
      enforceCheckbox.checked = false;
      enforcePrerequisites = false;
    }
    showAllHint.hidden = !showAllFeats;
    warnIcon.hidden = !showAllFeats;
    showAllCache.clear();
    refreshPicker(input?.value ?? '');
  });

  attachSourceCombo(panel, PICKER_KEY, () => {
    showAllCache.clear();
    refreshPicker(input?.value ?? '');
  });

  updateSlotListUi();
  await refreshSlotLabels();
  await syncPickerFromSlot();
  await refreshPicker('');
  onActiveSlotChange?.(activeSlotId);
  await onCollectionRefresh?.();

  renderTutorHint?.(panel);
  updateFilterStatus(null);
}
