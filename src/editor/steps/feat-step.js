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
  collectClassGrantIds,
  resolveRecommendedFeatSeeds
} from '../../character/class-selections.js';
import { writeGrantGroup } from '../../character/grant-slots.js';
import { RITUAL_CASTER_FEAT_ID } from '../../character/ritual-selections.js';
import {
  buildFeatEligibilityContext,
  filterFeatEntries
} from '../feat-prerequisite.js';
import { COMPENDIUM_SEARCH_MIN } from '../picker/combobox-picker.js';
import { renderLinkedEntryPreview } from '../../ui/compendium-links.js';
import {
  renderSourceComboHtml,
  attachSourceCombo,
  getActiveSourceBooksFromCombo
} from '../picker/picker-source-combo.js';
import { escapeHtml as esc } from '../../shared/escape-html.js';
import { pickerCardClass } from '../picker/picker-card.js';
import { compendiumEntryPageUrl } from '../../ui/compendium-entry-url.js';
import { renderGrantSectionHtml } from './grant-section-html.js';

const PICKER_KEY = 'feats';

const LIST_CAP = 100;
const SEARCH_LIST_THRESHOLD = 5;
const ELIGIBLE_FETCH_LIMIT = 500;
const SHOW_ALL_LIMIT = 3500;

/** @type {Map<string, { entries: object[], at: number }>} */
const showAllCache = new Map();

/**
 * @param {HTMLElement} panel
 * @param {object} ctx
 */
export async function renderFeatStep(panel, ctx) {
  const {
    character,
    compendium,
    onPersist,
    refreshBonuses,
    onCollectionRefresh,
    onActiveSlotChange,
    renderTutorHint,
    linkIndex
  } = ctx;

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

  const className = classEntry?.listing_fields?.Name || character.identity?.class || 'Class';
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
        (this level and lower, tier and prerequisites must match). Use the
        <strong>×</strong> beside a filled slot to clear it. The list shows feat names.
        When more than five feats match, type at least ${COMPENDIUM_SEARCH_MIN} letters to narrow it.
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
            <label class="feat-class-filter">
              <input
                type="checkbox"
                id="feat-require-class"
                aria-label="${esc(`Filter feats that require ${className}`)}"
              />
              <span>${esc(className)}</span>
            </label>
          </div>
          <div id="feat-shared-picker" class="power-shared-picker">
            <div id="feat-search-wrap" class="picker-combobox" hidden>
              <label class="picker-combobox-label" for="picker-feat-shared">Feat picker</label>
              <input
                type="search"
                id="picker-feat-shared"
                class="picker-combobox-input feat-picker-search"
                placeholder="Select a feat for the active slot"
                autocomplete="off"
                aria-controls="feat-name-list"
              />
            </div>
            <div class="feat-browse">
              <div
                id="feat-name-list"
                class="feat-name-list"
                role="listbox"
                aria-label="Feats"
                tabindex="0"
              ></div>
              <div
                id="feat-entry-preview"
                class="feat-entry-preview"
                role="region"
                aria-live="polite"
                aria-label="Compendium entry"
              ></div>
            </div>
          </div>
        </div>
      </div>
      <div id="feat-granted-sections" class="power-granted-sections"></div>
    </section>`;

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
    await refreshPicker('');
    await onCollectionRefresh?.();
  }

  recommendBtn?.addEventListener('click', () => applyRecommendedFeats());

  const input = panel.querySelector('#picker-feat-shared');
  const searchWrap = panel.querySelector('#feat-search-wrap');
  const nameList = panel.querySelector('#feat-name-list');
  const previewEl = panel.querySelector('#feat-entry-preview');
  const classCheckbox = panel.querySelector('#feat-require-class');

  let requireClass = false;
  let highlightedId = null;
  let refreshSeq = 0;
  let ignoreNameListScroll = false;
  let nameListScrollTimer = 0;

  nameList?.addEventListener(
    'scroll',
    () => {
      if (ignoreNameListScroll || !nameList) return;
      nameList.classList.add('is-scrolling');
      window.clearTimeout(nameListScrollTimer);
      nameListScrollTimer = window.setTimeout(() => {
        nameList.classList.remove('is-scrolling');
      }, 700);
    },
    { passive: true }
  );

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
    // Class-name filter runs client-side, so the pool must cover the full
    // alphabet — the eligible 500-cap ends mid-C and drops later Warlord feats.
    const fetchFullPool = showAllFeats || requireClass;
    const cacheKey = `${fetchFullPool}|${enforcePrerequisites}|${level}|${q}|${(sourceBooks ?? []).join(',')}`;

    if (fetchFullPool && !q) {
      const cached = showAllCache.get(cacheKey);
      if (cached) return cached.entries;
    }

    const limit = fetchFullPool ? SHOW_ALL_LIMIT : ELIGIBLE_FETCH_LIMIT;
    const entries = await compendium.listEntries('feat', {
      search: q.length >= COMPENDIUM_SEARCH_MIN ? q : '',
      limit,
      sourceBooks: sourceBooks ?? undefined,
      maxLevel: showAllFeats ? undefined : level
    });

    if (fetchFullPool && !q) {
      showAllCache.set(cacheKey, { entries, at: Date.now() });
    }

    return entries;
  }

  async function showFeatPreview(featId) {
    if (!previewEl) return;
    if (!featId) {
      previewEl.innerHTML = '';
      return;
    }
    const entry = await compendium.getEntry(featId);
    const html = entry?.body_html?.trim() ? entry.body_html : '<p>No description available.</p>';
    if (linkIndex?.terms?.length) renderLinkedEntryPreview(previewEl, html, linkIndex);
    else previewEl.innerHTML = html;
  }

  function scrollOptionIntoList(btn) {
    if (!nameList || !btn) return;
    const top = btn.offsetTop;
    const bottom = top + btn.offsetHeight;
    let next = nameList.scrollTop;
    if (top < nameList.scrollTop) next = top;
    else if (bottom > nameList.scrollTop + nameList.clientHeight) {
      next = bottom - nameList.clientHeight;
    }
    if (next === nameList.scrollTop) return;
    ignoreNameListScroll = true;
    nameList.scrollTop = next;
    ignoreNameListScroll = false;
  }

  function markHighlighted(featId) {
    highlightedId = featId;
    if (!nameList) return;
    let selectedBtn = null;
    nameList.querySelectorAll('.feat-name-option').forEach((btn) => {
      const on = btn.dataset.id === featId;
      btn.classList.toggle('is-selected', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on) selectedBtn = btn;
    });
    if (selectedBtn) {
      nameList.setAttribute('aria-activedescendant', selectedBtn.id);
      scrollOptionIntoList(selectedBtn);
    } else {
      nameList.removeAttribute('aria-activedescendant');
    }
  }

  function renderNameList(entries, featId) {
    if (!nameList) return;
    if (!entries.length) {
      nameList.innerHTML = `<p class="feat-name-empty">${esc(
        showAllFeats
          ? 'No matching feats.'
          : 'No eligible feats for this slot. Try Show all feats or adjust filters.'
      )}</p>`;
      nameList.removeAttribute('aria-activedescendant');
      highlightedId = null;
      return;
    }
    nameList.innerHTML = entries
      .map((entry, index) => {
        const name = entry.listing_fields?.Name ?? entry.id;
        const on = entry.id === featId;
        return `<div role="option" class="feat-name-option${on ? ' is-selected' : ''}" id="feat-name-opt-${index}" data-id="${esc(entry.id)}" aria-selected="${on ? 'true' : 'false'}">${esc(name)}</div>`;
      })
      .join('');
    highlightedId = featId;
    const selectedBtn = nameList.querySelector('.feat-name-option.is-selected');
    if (selectedBtn) {
      nameList.setAttribute('aria-activedescendant', selectedBtn.id);
      scrollOptionIntoList(selectedBtn);
    }
  }

  async function assignFeat(featId) {
    const slot = getActiveSlot();
    if (!slot || !featId) return;
    const entry = await compendium.getEntry(featId);
    if (!entry) return;

    setFeatForSlot(character, slot.id, featId);
    syncFeatNotesFromSelections(character, { [featId]: entry.listing_fields?.Name ?? featId });
    if (refreshBonuses) await refreshBonuses();
    await onPersist();

    updateQuota();
    updateSlotListUi();
    await refreshSlotLabels();
    onActiveSlotChange?.(slot.id);
    await onCollectionRefresh?.();
    await refreshPicker(input?.value ?? '');
  }

  function moveHighlight(delta) {
    if (!nameList) return;
    const options = [...nameList.querySelectorAll('.feat-name-option')];
    if (!options.length) return;
    const current = options.findIndex((btn) => btn.dataset.id === highlightedId);
    const start = current < 0 ? 0 : current;
    const next = Math.min(options.length - 1, Math.max(0, start + delta));
    const btn = options[next];
    markHighlighted(btn.dataset.id);
    showFeatPreview(btn.dataset.id);
  }

  async function refreshPicker(query = '') {
    const seq = ++refreshSeq;
    const slot = getActiveSlot();
    if (!slot || !nameList) return;

    const selectedId = character.selections.featSelections?.[slot.id] ?? null;
    const excludeIds = new Set();
    for (const [sid, fid] of Object.entries(character.selections.featSelections ?? {})) {
      if (fid && sid !== slot.id) excludeIds.add(fid);
    }
    for (const fid of [
      ...(character.selections.raceFeatIds ?? []),
      ...(character.selections.classFeatIds ?? [])
    ]) {
      const id = String(fid);
      if (id && id !== selectedId) excludeIds.add(id);
    }

    const ctxElig = await buildFeatEligibilityContext(character, compendium, slot);
    if (seq !== refreshSeq) return;
    const basePool = await loadFeatPool('');
    if (seq !== refreshSeq) return;

    const filterBase = {
      showAll: showAllFeats,
      enforcePrerequisites,
      requireClass,
      retrain: isRetrain(slot),
      excludeIds
    };
    const baseFiltered = filterFeatEntries(basePool, ctxElig, slot, { ...filterBase, query: '' });
    const showSearch = baseFiltered.length > SEARCH_LIST_THRESHOLD;
    if (searchWrap) searchWrap.hidden = !showSearch;

    let typed = showSearch ? String(query ?? '') : '';
    if (!showSearch && input?.value) input.value = '';

    let pool = basePool;
    if (typed.trim().length >= COMPENDIUM_SEARCH_MIN) {
      pool = await loadFeatPool(typed);
      if (seq !== refreshSeq) return;
    }

    const filtered = filterFeatEntries(pool, ctxElig, slot, { ...filterBase, query: typed });
    const shown = filtered.slice(0, LIST_CAP);
    updateFilterStatus(filtered.length);

    const highlight =
      selectedId && shown.some((entry) => entry.id === selectedId) ? selectedId : (shown[0]?.id ?? null);
    renderNameList(shown, highlight);
    await showFeatPreview(highlight);
  }

  panel.querySelectorAll('.power-slot-row').forEach((row) => {
    row.addEventListener('click', async () => {
      activeSlotId = row.dataset.slotId;
      onActiveSlotChange?.(activeSlotId);
      updateSlotListUi();
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

  input?.addEventListener('input', () => {
    refreshPicker(input.value);
  });

  nameList?.addEventListener('click', (e) => {
    const btn = e.target.closest('.feat-name-option');
    if (!btn?.dataset.id) return;
    nameList.focus();
    assignFeat(btn.dataset.id);
  });

  nameList?.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveHighlight(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveHighlight(-1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      moveHighlight(-100000);
    } else if (e.key === 'End') {
      e.preventDefault();
      moveHighlight(100000);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedId) assignFeat(highlightedId);
    }
  });

  classCheckbox?.addEventListener('change', () => {
    requireClass = classCheckbox.checked;
    refreshPicker(input?.value ?? '');
  });

  attachSourceCombo(panel, PICKER_KEY, () => {
    showAllCache.clear();
    refreshPicker(input?.value ?? '');
  });

  function sameIdList(left, right) {
    const norm = (ids) =>
      [...ids].map((id) => String(id).toLowerCase()).sort().join(',');
    return norm(left) === norm(right);
  }

  async function syncClassGrantFeats() {
    if (!classEntry) return [];
    const { classFeatIds } = collectClassGrantIds(character, classEntry);
    const items = [];
    for (const raw of classFeatIds) {
      const id = String(raw).toLowerCase();
      const entry = await compendium.getEntry(id);
      const name =
        entry?.listing_fields?.Name ||
        (id === RITUAL_CASTER_FEAT_ID ? 'Ritual Caster' : id);
      items.push({ id, name, entry });
    }
    const stored = character.selections.classFeatIds ?? [];
    const storedNames = new Map(
      (character.selections.grantSlots?.classFeats ?? []).map((slot) => [
        String(slot.id).toLowerCase(),
        slot.name
      ])
    );
    const namesMatch = items.every((item) => storedNames.get(item.id) === item.name);
    if (!sameIdList(stored, items.map((item) => item.id)) || !namesMatch) {
      character.selections.classFeatIds = items.map((item) => item.id);
      writeGrantGroup(
        character,
        'classFeats',
        items.map((item) => ({ id: item.id, name: item.name }))
      );
      await onPersist?.();
    }
    return items;
  }

  async function renderGrantedFeatSections(classFeats) {
    const host = panel.querySelector('#feat-granted-sections');
    if (!host) return;
    const pathname = location.pathname;
    const raceNames = new Map(
      (character.selections?.grantSlots?.raceFeats ?? []).map((slot) => [
        String(slot.id).toLowerCase(),
        slot.name
      ])
    );
    const raceRows = [];
    for (const raw of character.selections?.raceFeatIds ?? []) {
      const id = String(raw).toLowerCase();
      const entry = await compendium.getEntry(id);
      const name = raceNames.get(id) || entry?.listing_fields?.Name || id;
      const meta = [entry?.listing_fields?.Tier, entry?.listing_fields?.SourceBook].filter(Boolean).join(' · ');
      raceRows.push({
        name,
        meta: meta || 'From your race',
        links: [
          {
            href: compendiumEntryPageUrl(id, pathname),
            ariaLabel: `Open ${name} in compendium`
          }
        ]
      });
    }
    const themeName = character.identity?.theme || 'Theme';
    const themeRows = [];
    for (const slot of character.selections?.grantSlots?.themeFeats ?? []) {
      const id = String(slot.id).toLowerCase();
      const entry = await compendium.getEntry(id);
      const name = slot.name || entry?.listing_fields?.Name || id;
      themeRows.push({
        name,
        meta: themeName,
        links: [
          {
            href: compendiumEntryPageUrl(id, pathname),
            ariaLabel: `Open ${name} in compendium`
          }
        ]
      });
    }
    const classRows = classFeats.map((item) => {
      const meta = [item.entry?.listing_fields?.Tier, item.entry?.listing_fields?.SourceBook]
        .filter(Boolean)
        .join(' · ');
      return {
        name: item.name,
        meta: meta || 'From your class',
        links: [
          {
            href: compendiumEntryPageUrl(item.id, pathname),
            ariaLabel: `Open ${item.name} in compendium`
          }
        ]
      };
    });
    host.innerHTML = [
      renderGrantSectionHtml({
        kind: 'race-feats',
        title: 'Race',
        ariaLabel: 'Race feats',
        note: 'Granted by your race. These slots cannot be edited here. Choose a different race to change them.',
        groups: [{ rows: raceRows }]
      }),
      renderGrantSectionHtml({
        kind: 'class-feats',
        title: 'Class',
        ariaLabel: 'Class feats',
        note: 'Granted by your class. These slots cannot be edited here. Choose a different class to change them.',
        groups: [{ rows: classRows }]
      }),
      renderGrantSectionHtml({
        kind: 'theme-feats',
        title: 'Theme',
        ariaLabel: 'Theme feats',
        note: 'Granted by your theme. These slots cannot be edited here. Choose a different theme to change them.',
        groups: [{ rows: themeRows }]
      })
    ].join('');
  }

  updateSlotListUi();
  await refreshSlotLabels();
  const classGrantFeats = await syncClassGrantFeats();
  await renderGrantedFeatSections(classGrantFeats);
  await refreshPicker('');
  onActiveSlotChange?.(activeSlotId);
  await onCollectionRefresh?.();

  renderTutorHint?.(panel);
  updateFilterStatus(null);
}
