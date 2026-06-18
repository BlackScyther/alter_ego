import {
  renderComboboxHtml,
  attachComboboxBehavior,
  renderPickerOptions,
  filterEntriesBySearch,
  setComboboxInputFromEntry,
  showIdleHint,
  COMPENDIUM_SEARCH_MIN
} from '../picker/combobox-picker.js';
import {
  renderSourceComboHtml,
  attachSourceCombo,
  getActiveSourceBooksFromCombo
} from '../picker/picker-source-combo.js';
import { applyChoiceGuide } from '../choice-guide.js';
import { escapeHtml as esc } from '../../shared/escape-html.js';
import {
  filterBaseRaces,
  filterSubracesForParent,
  resolveRacePair,
  parentHasSubraces,
  getSubracesForParent
} from '../../character/race-subraces.js';
import {
  ensureRaceSelectionsShape,
  resetRaceDerivedSelections,
  getRaceBuildDecisions,
  collectRaceGrantIds,
  syncRaceNotesAndGrants,
  setRaceBuildChoice,
  setRaceBonusChoice,
  validateRaceStep
} from '../../character/race-selections.js';
import { renderCombinedRacePreviewHtml } from '../../character/race-parse.js';
import { renderLinkedEntryPreview } from '../../ui/compendium-links.js';
import { compendiumEntryPageUrl } from '../../ui/compendium-entry-url.js';

const BASE_PICKER_KEY = 'race-base';
const SUBRACE_PICKER_KEY = 'race-subrace';
const LIST_LIMIT = 100;

/** @type {'base' | 'subrace' | 'confirmed'} */
let pickerPhase = 'base';
/** @type {string | null} */
let pendingBaseId = null;

/**
 * @param {Record<string, string> | undefined} fields
 */
function formatRaceListingMeta(fields) {
  const parts = [fields?.Origin, fields?.Size, fields?.SourceBook].filter(Boolean);
  return parts.join(' · ');
}

/**
 * @param {HTMLElement} previewEl
 * @param {(kind: string, group: string, value: string) => void} onChange
 */
function attachPreviewBonusChoices(previewEl, onChange) {
  if (!previewEl || previewEl.dataset.bonusDelegation) return;
  previewEl.dataset.bonusDelegation = 'true';
  previewEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.race-choice-btn');
    if (!btn) return;
    const wrap = btn.closest('.race-inline-choices');
    if (!wrap) return;
    const kind = wrap.dataset.kind;
    const group = wrap.dataset.choiceGroup;
    const value = btn.dataset.value;
    if (kind && group && value) onChange(kind, group, value);
  });
  previewEl.addEventListener('change', (e) => {
    const select = e.target.closest('.race-choice-combo');
    if (!select) return;
    const wrap = select.closest('.race-inline-choices');
    if (!wrap) return;
    const kind = wrap.dataset.kind;
    const group = wrap.dataset.choiceGroup;
    const value = select.value;
    if (kind && group && value) onChange(kind, group, value);
  });
}

function renderBuildChoiceGroups(container, character, baseEntry, variantEntry, onChange) {
  const raceId = character.selections?.raceId ?? pendingBaseId;
  const { baseId } = resolveRacePair(raceId);
  const decisions = getRaceBuildDecisions(baseId ?? raceId, baseEntry?.listing_fields?.Name);
  if (!decisions.length) {
    container.querySelector('.race-build-choices-host')?.remove();
    container.hidden = true;
    return;
  }
  container.hidden = false;
  const choices = character.selections?.raceBuildChoices ?? {};
  let choicesHost = container.querySelector('.race-build-choices-host');
  if (!choicesHost) {
    choicesHost = document.createElement('div');
    choicesHost.className = 'race-build-choices-host';
    container.appendChild(choicesHost);
  }
  choicesHost.innerHTML = `<h3 class="race-section-title">Build choices</h3>`;
  for (const d of decisions) {
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'race-build-fieldset';
    fieldset.dataset.choiceGuide = 'race-build';
    fieldset.dataset.decisionId = d.id;
    fieldset.id = `choice-guide-race-build-${d.id}`;
    fieldset.innerHTML = `<legend>${esc(d.prompt || d.label)}</legend>`;
    const picked = choices[d.id] ?? '';
    const options = d.options ?? [];
    if (!options.length) {
      const hint = document.createElement('p');
      hint.className = 'race-build-empty-hint';
      hint.textContent = 'No build options available.';
      fieldset.appendChild(hint);
      choicesHost.appendChild(fieldset);
      continue;
    }
    for (const opt of options) {
      const inputId = `race-build-${d.id}-${opt.id}`;
      const row = document.createElement('div');
      row.className = 'race-build-option-row';

      const wrap = document.createElement('label');
      wrap.className = 'race-build-option';
      wrap.innerHTML = `<input type="radio" name="race-build-${d.id}" id="${esc(inputId)}" value="${esc(opt.id)}" ${picked === opt.id ? 'checked' : ''} /><span>${esc(opt.label)}</span>`;
      wrap.querySelector('input').addEventListener('change', (e) => {
        if (e.target.checked) onChange(d.id, opt.id);
      });
      row.appendChild(wrap);

      if (opt.powerId) {
        const openLink = document.createElement('a');
        openLink.className = 'character-collection-open race-build-open';
        openLink.href = compendiumEntryPageUrl(opt.powerId, location.pathname);
        openLink.target = '_blank';
        openLink.rel = 'noopener noreferrer';
        openLink.title = 'Open compendium entry in new window';
        openLink.setAttribute('aria-label', `Open ${opt.label} in compendium`);
        openLink.textContent = '↗';
        openLink.addEventListener('click', (e) => e.stopPropagation());
        row.appendChild(openLink);
      }

      fieldset.appendChild(row);
    }
    choicesHost.appendChild(fieldset);
  }
}

function setPhase(panel, phase) {
  pickerPhase = phase;
  panel.querySelector('#picker-base-toolbar')?.classList.toggle('hidden', phase !== 'base');
  panel.querySelector('#picker-subrace-toolbar')?.classList.toggle('hidden', phase !== 'subrace');
  panel.querySelector('#picker-confirmed-toolbar')?.classList.toggle('hidden', phase !== 'confirmed');
}

/**
 * @param {HTMLElement} panel
 * @param {object} ctx
 */
export async function renderRaceStep(panel, ctx) {
  const {
    character,
    compendium,
    def,
    applySelection,
    onPersist,
    refreshBonuses,
    renderTutorHint,
    linkIndex,
    renderPreviewEntry
  } = ctx;

  ensureRaceSelectionsShape(character);
  const sourceBooks = await compendium.distinctSourceBooks('race');

  const { baseId, variantId } = resolveRacePair(character.selections.raceId);
  if (character.selections.raceId) {
    pickerPhase = variantId || !parentHasSubraces(baseId ?? character.selections.raceId) ? 'confirmed' : 'subrace';
    pendingBaseId = baseId ?? character.selections.raceId;
  } else {
    pickerPhase = 'base';
    pendingBaseId = null;
  }

  panel.innerHTML = `
    <div class="compendium-picker race-step" data-category="race">
      <div id="picker-base-toolbar" class="picker-toolbar">
        <div class="picker-toolbar-row">
          ${renderSourceComboHtml({ pickerKey: BASE_PICKER_KEY, sourceBooks, groupLabel: 'Race source' })}
        </div>
        ${renderComboboxHtml({
          inputId: 'picker-search',
          listboxId: 'picker-listbox-base',
          placeholder: `Select ${def.title}`,
          visibleLabel: def.title
        })}
      </div>
      <div id="picker-subrace-toolbar" class="picker-toolbar hidden">
        <p class="race-subrace-intro">Choose a subrace for <strong id="picker-base-name"></strong>.</p>
        <div class="picker-toolbar-row">
          ${renderSourceComboHtml({ pickerKey: SUBRACE_PICKER_KEY, sourceBooks, groupLabel: 'Subrace source' })}
        </div>
        ${renderComboboxHtml({
          inputId: 'picker-subrace-search',
          listboxId: 'picker-listbox-subrace',
          placeholder: 'Select subrace',
          visibleLabel: 'Subrace'
        })}
      </div>
      <div id="picker-confirmed-toolbar" class="picker-toolbar hidden">
        <div class="race-confirmed-bar">
          <span>Race: <strong id="picker-confirmed-name"></strong></span>
          <button type="button" class="btn btn-secondary" id="picker-change-race">Change race</button>
        </div>
        <p class="race-confirmed-hint hidden" id="picker-race-done-hint">All race choices complete — you can continue.</p>
      </div>
      <div class="entry-preview" id="entry-preview"></div>
      <div id="race-build-choices" class="race-choices-panel" hidden></div>
    </div>`;

  const baseListbox = panel.querySelector('#picker-listbox-base');
  const subraceListbox = panel.querySelector('#picker-listbox-subrace');
  const preview = panel.querySelector('#entry-preview');
  const baseSearch = panel.querySelector('#picker-search');
  const subraceSearch = panel.querySelector('#picker-subrace-search');
  const buildEl = panel.querySelector('#race-build-choices');

  let baseEntry = null;
  let variantEntry = null;

  async function loadRacePool(query, pickerKey, baseOnly, parentId = null) {
    const sourceFilter = getActiveSourceBooksFromCombo(pickerKey);
    const q = query.trim();
    let entries = await compendium.listEntries('race', {
      search: q.length >= COMPENDIUM_SEARCH_MIN ? q : '',
      limit: LIST_LIMIT,
      sourceBooks: sourceFilter ?? undefined
    });
    if (baseOnly) entries = filterBaseRaces(entries);
    else if (parentId) entries = filterSubracesForParent(entries, parentId);
    return entries;
  }

  async function refreshBaseList(query = '') {
    const q = query.trim();
    if (q.length > 0 && q.length < COMPENDIUM_SEARCH_MIN) {
      const pool = await loadRacePool('', BASE_PICKER_KEY, true);
      const narrowed = filterEntriesBySearch(pool, q);
      if (narrowed.length) {
        renderPickerOptions(baseListbox, narrowed, pendingBaseId, onPickBase, (e) =>
          formatRaceListingMeta(e.listing_fields)
        );
        return;
      }
      showIdleHint(baseListbox, def.title);
      return;
    }
    let shown = await loadRacePool(q, BASE_PICKER_KEY, true);
    if (q.length > 0 && q.length < COMPENDIUM_SEARCH_MIN) shown = filterEntriesBySearch(shown, q);
    renderPickerOptions(
      baseListbox,
      shown.slice(0, LIST_LIMIT),
      pendingBaseId,
      onPickBase,
      (e) => formatRaceListingMeta(e.listing_fields)
    );
  }

  async function refreshSubraceList(query = '') {
    if (!pendingBaseId) return;
    const q = query.trim();
    if (q.length > 0 && q.length < COMPENDIUM_SEARCH_MIN) {
      const pool = await loadRacePool('', SUBRACE_PICKER_KEY, false, pendingBaseId);
      const narrowed = filterEntriesBySearch(pool, q);
      renderPickerOptions(
        subraceListbox,
        narrowed,
        character.selections.raceId,
        onPickSubrace,
        (e) => formatRaceListingMeta(e.listing_fields)
      );
      return;
    }
    const shown = await loadRacePool(q, SUBRACE_PICKER_KEY, false, pendingBaseId);
    renderPickerOptions(
      subraceListbox,
      shown.slice(0, LIST_LIMIT),
      character.selections.raceId,
      onPickSubrace,
      (e) => formatRaceListingMeta(e.listing_fields)
    );
  }

  async function loadRaceEntries() {
    const pair = resolveRacePair(character.selections.raceId);
    baseEntry = pair.baseId ? await compendium.getEntry(pair.baseId) : null;
    variantEntry = pair.variantId ? await compendium.getEntry(pair.variantId) : null;
    if (!baseEntry && character.selections.raceId) {
      baseEntry = await compendium.getEntry(character.selections.raceId);
    }
  }

  async function loadGrantEntriesForPreview() {
    // Same gating as the actual grants: powers tied to an unmade build
    // decision are not previewed until the user picks an option.
    const { racePowerIds, raceFeatIds } = collectRaceGrantIds(character, baseEntry, variantEntry);
    const ids = new Set([...racePowerIds, ...raceFeatIds]);
    /** @type {Array<{ id: string, name: string, bodyHtml: string, kind: string }>} */
    const grantEntries = [];
    for (const id of ids) {
      const entry = await compendium.getEntry(id);
      if (!entry) continue;
      grantEntries.push({
        id: entry.id,
        name: entry.listing_fields?.Name ?? entry.id,
        bodyHtml: entry.body_html ?? '',
        kind: /^power/i.test(entry.id) ? 'power' : 'feat'
      });
    }
    return grantEntries;
  }

  async function refreshPreview() {
    await loadRaceEntries();
    const previewTerms = [];
    const { baseId } = resolveRacePair(character.selections.raceId ?? pendingBaseId);
    for (const d of getRaceBuildDecisions(baseId ?? character.selections.raceId, baseEntry?.listing_fields?.Name)) {
      for (const t of d.previewTerms ?? []) previewTerms.push(t);
    }
    const grantEntries = await loadGrantEntriesForPreview();
    const raceBonusChoices = character.selections?.raceBonusChoices ?? { ability: {}, skill: {} };
    const html = renderCombinedRacePreviewHtml(baseEntry, variantEntry, {
      previewTerms,
      grantEntries,
      raceBonusChoices
    });
    if (linkIndex) renderLinkedEntryPreview(preview, html, linkIndex);
    else preview.innerHTML = html;

    renderBuildChoiceGroups(buildEl, character, baseEntry, variantEntry, async (decisionId, optionId) => {
      setRaceBuildChoice(character, decisionId, optionId, baseEntry, variantEntry);
      applySelection('race', variantEntry ?? baseEntry);
      await syncRaceState(false);
    });

    updateDoneHint();
    if (pickerPhase === 'confirmed') applyChoiceGuide(panel);
  }

  async function syncRaceState(updateNotes = true) {
    await loadRaceEntries();
    if (updateNotes) {
      const powerEntries = [];
      for (const pid of character.selections.racePowerIds ?? []) {
        const e = await compendium.getEntry(pid);
        if (e) powerEntries.push(e);
      }
      syncRaceNotesAndGrants(character, baseEntry, variantEntry, powerEntries);
    }
    await refreshBonuses();
    await refreshPreview();
    await onPersist();
  }

  function updateDoneHint() {
    const hint = panel.querySelector('#picker-race-done-hint');
    const errors = validateRaceStep(character, baseEntry, variantEntry);
    hint?.classList.toggle('hidden', errors.length > 0);
  }

  async function confirmRace(entry) {
    resetRaceDerivedSelections(character);
    applySelection('race', entry);
    character.selections.raceId = entry.id;
    character.identity.race = entry.listing_fields?.Name ?? entry.id;
    character.identity.size = entry.listing_fields?.Size ?? character.identity.size;
    setPhase(panel, 'confirmed');
    panel.querySelector('#picker-confirmed-name').textContent = character.identity.race;
    await syncRaceState(true);
  }

  async function onPickBase(id, button) {
    const entry = await compendium.getEntry(id);
    if (!entry) return;
    pendingBaseId = id;
    baseSearch.value = entry.listing_fields?.Name ?? id;
    baseCombobox.closeDropdown();
    panel.querySelector('#picker-base-name').textContent = entry.listing_fields?.Name ?? id;

    if (parentHasSubraces(id)) {
      setPhase(panel, 'subrace');
      character.selections.raceId = null;
      await refreshSubraceList('');
      subraceSearch.value = '';
      subraceSearch.focus();
      preview.innerHTML = '';
      return;
    }

    await confirmRace(entry);
  }

  async function onPickSubrace(id, button) {
    const entry = await compendium.getEntry(id);
    if (!entry) return;
    subraceSearch.value = entry.listing_fields?.Name ?? id;
    subraceCombobox.closeDropdown();
    await confirmRace(entry);
  }

  const baseCombobox = attachComboboxBehavior(baseSearch, baseListbox, refreshBaseList);
  const subraceCombobox = attachComboboxBehavior(subraceSearch, subraceListbox, refreshSubraceList);

  attachSourceCombo(panel, BASE_PICKER_KEY, () => {
    refreshBaseList(baseSearch.value);
  });
  attachSourceCombo(panel, SUBRACE_PICKER_KEY, () => refreshSubraceList(subraceSearch.value));

  attachPreviewBonusChoices(preview, async (kind, group, value) => {
    setRaceBonusChoice(character, kind, group, value);
    await syncRaceState(true);
  });

  panel.querySelector('#picker-change-race')?.addEventListener('click', async () => {
    resetRaceDerivedSelections(character);
    character.selections.raceId = null;
    character.identity.race = '';
    pendingBaseId = null;
    pickerPhase = 'base';
    setPhase(panel, 'base');
    preview.innerHTML = '';
    buildEl.innerHTML = '';
    baseSearch.value = '';
    subraceSearch.value = '';
    await refreshBaseList('');
    await onPersist();
  });

  renderTutorHint?.(panel);
  setPhase(panel, pickerPhase);

  await refreshBaseList('');
  if (pickerPhase === 'subrace') {
    panel.querySelector('#picker-base-name').textContent =
      (await compendium.getEntry(pendingBaseId))?.listing_fields?.Name ?? pendingBaseId;
    await refreshSubraceList('');
  }

  if (character.selections.raceId) {
    await loadRaceEntries();
    if (pickerPhase === 'confirmed') {
      panel.querySelector('#picker-confirmed-name').textContent = character.identity.race;
      await setComboboxInputFromEntry(baseSearch, compendium, pendingBaseId ?? baseId);
      if (variantId) await setComboboxInputFromEntry(subraceSearch, compendium, variantId);
    }
    await refreshPreview();
  }
}

export function resetRaceStepUiState() {
  pickerPhase = 'base';
  pendingBaseId = null;
}
