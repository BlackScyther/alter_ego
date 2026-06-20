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
import {
  parseClassEntry,
  renderClassPreviewHtml
} from '../../character/class-parse.js';
import {
  ensureClassSelectionsShape,
  resetClassDerivedSelections,
  setClassBuildChoice,
  toggleClassTrainedSkill,
  syncClassNotesAndGrants,
  getPreviewTermsForClass,
  validateClassStep
} from '../../character/class-selections.js';
import { applyChoiceGuide } from '../choice-guide.js';
const PICKER_KEY = 'class';
const LIST_LIMIT = 100;

/**
 * Hybrid classes are detected by name prefix ("Hybrid Fighter", etc.).
 *
 * @param {{ listing_fields?: Record<string, string> } | null | undefined} entry
 */
function isHybridClassEntry(entry) {
  return String(entry?.listing_fields?.Name ?? '')
    .trim()
    .toLowerCase()
    .startsWith('hybrid ');
}

/**
 * @param {Record<string, string> | undefined} fields
 */
function formatClassListingMeta(fields) {
  const parts = [fields?.RoleName, fields?.PowerSourceText, fields?.SourceBook].filter(Boolean);
  return parts.join(' · ');
}

/**
 * @param {HTMLElement} previewEl
 * @param {(buildId: string) => void} onBuildPick
 * @param {(skillId: string) => void} onSkillToggle
 */
function attachPreviewClassChoices(previewEl, onBuildPick, onSkillToggle) {
  if (!previewEl || previewEl.dataset.classDelegation) return;
  previewEl.dataset.classDelegation = 'true';

  previewEl.addEventListener('click', (e) => {
    const buildBtn = e.target.closest('.class-build-btn');
    if (buildBtn) {
      const buildId = buildBtn.dataset.buildId;
      if (buildId) onBuildPick(buildId);
      return;
    }
    const skillBtn = e.target.closest('.class-skill-btn');
    if (skillBtn) {
      const skillId = skillBtn.dataset.skill;
      if (skillId) onSkillToggle(skillId);
    }
  });
}

/**
 * @param {HTMLElement} panel
 * @param {object} ctx
 * @param {import('../../character/model.js').Character} ctx.character
 * @param {import('../../data/compendium.js').CompendiumProvider} ctx.compendium
 * @param {object} ctx.def
 * @param {(stepId: string, entry: object) => void} ctx.applySelection
 * @param {() => string} ctx.getNotes
 * @param {(text: string) => void} ctx.setNotes
 * @param {() => Promise<void>} ctx.onPersist
 * @param {() => Promise<void>} ctx.refreshBonuses
 * @param {(panel: HTMLElement) => void} [ctx.renderTutorHint]
 * @param {object} [ctx.linkIndex]
 * @param {(entry: object) => void} [ctx.renderPreviewEntry]
 */
export async function renderClassStep(panel, ctx) {
  const {
    character,
    compendium,
    def,
    applySelection,
    getNotes,
    setNotes,
    onPersist,
    refreshBonuses,
    renderTutorHint,
    linkIndex,
    renderPreviewEntry
  } = ctx;
  ensureClassSelectionsShape(character);
  const sourceBooks = await compendium.distinctSourceBooks('class');
  const getSelectedId = () => character.selections.classId ?? null;

  const hybridOn = character.selections.classHybrid === true;

  panel.innerHTML = `
    <div class="compendium-picker class-step" data-category="class">
      <div class="picker-toolbar">
        <div class="picker-toolbar-row">
          ${renderSourceComboHtml({ pickerKey: PICKER_KEY, sourceBooks, groupLabel: 'Class source' })}
        </div>
        <label class="picker-hybrid-toggle">
          <input type="checkbox" id="picker-class-hybrid"${hybridOn ? ' checked' : ''} />
          <span>Hybrid class</span>
        </label>
        ${renderComboboxHtml({
          inputId: 'picker-search',
          listboxId: 'picker-listbox',
          placeholder: `Select ${def.title}`,
          visibleLabel: def.title
        })}
        <div class="picker-combobox-secondary" id="picker-secondary-wrap"${hybridOn ? '' : ' hidden'}>
          ${renderComboboxHtml({
            inputId: 'picker-search-2',
            listboxId: 'picker-listbox-2',
            placeholder: `Select second ${def.title}`,
            visibleLabel: `Second ${def.title}`
          })}
        </div>
      </div>
      <div class="class-step-body">
        <div class="entry-preview" id="entry-preview"></div>
      </div>
      <p class="picker-done-hint hidden" id="picker-class-done-hint">Class choices complete.</p>
    </div>`;

  const listbox = panel.querySelector('#picker-listbox');
  const preview = panel.querySelector('#entry-preview');
  const searchInput = panel.querySelector('#picker-search');
  const hybridCheckbox = panel.querySelector('#picker-class-hybrid');
  const secondaryWrap = panel.querySelector('#picker-secondary-wrap');
  const listbox2 = panel.querySelector('#picker-listbox-2');
  const searchInput2 = panel.querySelector('#picker-search-2');
  /** @type {object | null} */
  let currentEntry = null;

  function isHybridMode() {
    return character.selections.classHybrid === true;
  }

  async function loadClassPool(query) {
    const sourceFilter = getActiveSourceBooksFromCombo(PICKER_KEY);
    const q = query.trim();
    return compendium.listEntries('class', {
      search: q.length >= COMPENDIUM_SEARCH_MIN ? q : '',
      limit: LIST_LIMIT,
      sourceBooks: sourceFilter ?? undefined
    });
  }

  /**
   * Hybrid-aware filtering: hide hybrid classes unless hybrid mode is on, in
   * which case only hybrid classes are listed. Always excludes the id picked in
   * the other picker so the same hybrid class cannot be chosen twice.
   *
   * @param {object[]} entries
   * @param {string | null} otherId
   */
  function filterClassPool(entries, otherId) {
    const hybrid = isHybridMode();
    return entries.filter((e) => {
      if (isHybridClassEntry(e) !== hybrid) return false;
      if (otherId && e.id === otherId) return false;
      return true;
    });
  }

  function refreshPreview(entry) {
    if (!entry) {
      preview.innerHTML = '';
      return;
    }
    const parsed = parseClassEntry(entry);
    const previewTerms = getPreviewTermsForClass(character, entry);
    preview.innerHTML = renderClassPreviewHtml(entry, parsed, {
      buildChoices: character.selections.classBuildChoices,
      trainedSkillChoices: character.selections.classTrainedSkillChoices,
      previewTerms
    });
    updateDoneHint(entry);
    if (character.selections?.classId && entry) applyChoiceGuide(panel);
  }

  function updateDoneHint(entry = currentEntry) {
    const hint = panel.querySelector('#picker-class-done-hint');
    const errors = validateClassStep(character, entry);
    hint?.classList.toggle('hidden', errors.length > 0);
  }

  async function syncClassState(entry) {
    if (!entry) return;
    const powerEntries = [];
    for (const pid of character.selections.classPowerIds ?? []) {
      const e = await compendium.getEntry(pid);
      if (e) powerEntries.push(e);
    }
    syncClassNotesAndGrants(character, entry, powerEntries);
    setNotes(character.notes.classFeatures ?? '');
    await refreshBonuses();
    refreshPreview(entry);
    await onPersist();
  }

  async function afterChoiceChange() {
    if (!currentEntry) return;
    await syncClassState(currentEntry);
  }

  attachPreviewClassChoices(
    preview,
    (buildId) => {
      setClassBuildChoice(character, 'build', buildId, currentEntry);
      afterChoiceChange();
    },
    (skillId) => {
      toggleClassTrainedSkill(character, skillId, currentEntry);
      afterChoiceChange();
    }
  );

  const metaFmt = (e) => formatClassListingMeta(e.listing_fields);

  function markSelectedOption(targetListbox, button) {
    targetListbox.querySelectorAll('.picker-option').forEach((r) => {
      r.classList.remove('picker-option--selected');
      r.setAttribute('aria-selected', 'false');
    });
    button.classList.add('picker-option--selected');
    button.setAttribute('aria-selected', 'true');
  }

  /**
   * @param {object} cfg
   * @param {HTMLElement} cfg.targetListbox
   * @param {() => string | null} cfg.getSelectedId
   * @param {() => string | null} cfg.getOtherId
   * @param {(id: string, button: HTMLButtonElement) => void} cfg.onPick
   */
  function makeRefresh({ targetListbox, getSelectedId: getSel, getOtherId, onPick }) {
    return async function refresh(query = '') {
      const q = query.trim();
      const otherId = getOtherId();

      if (q.length > 0 && q.length < COMPENDIUM_SEARCH_MIN) {
        const pool = filterClassPool(await loadClassPool(''), otherId);
        const narrowed = filterEntriesBySearch(pool, q);
        if (narrowed.length > 0) {
          renderPickerOptions(targetListbox, narrowed, getSel(), onPick, metaFmt);
          return;
        }
        showIdleHint(targetListbox, def.title);
        return;
      }

      const shown = filterClassPool(await loadClassPool(q), otherId);
      renderPickerOptions(targetListbox, shown.slice(0, LIST_LIMIT), getSel(), onPick, metaFmt);
    };
  }

  const refresh = makeRefresh({
    targetListbox: listbox,
    getSelectedId,
    getOtherId: () => (isHybridMode() ? character.selections.hybridClassIds?.[1] ?? null : null),
    onPick: (id, button) => onPickPrimary(id, button)
  });

  const refreshSecondary = makeRefresh({
    targetListbox: listbox2,
    getSelectedId: () => character.selections.hybridClassIds?.[1] ?? null,
    getOtherId: () => character.selections.classId ?? null,
    onPick: (id, button) => onPickSecondary(id, button)
  });

  async function onPickPrimary(id, button) {
    const entry = await compendium.getEntry(id);
    if (!entry) return;
    if (character.selections.classId !== id) {
      resetClassDerivedSelections(character);
    }
    currentEntry = entry;
    applySelection('class', entry);
    if (isHybridMode()) character.selections.hybridClassIds[0] = id;
    await syncClassState(entry);
    searchInput.value = entry.listing_fields?.Name ?? id;
    combobox.closeDropdown();
    markSelectedOption(listbox, button);
    if (isHybridMode()) await refreshSecondary(searchInput2.value);
  }

  async function onPickSecondary(id, button) {
    const entry = await compendium.getEntry(id);
    if (!entry) return;
    ensureClassSelectionsShape(character);
    const ids = character.selections.hybridClassIds;
    ids[0] = character.selections.classId ?? ids[0] ?? null;
    ids[1] = id;
    character.selections.hybridClassIds = ids;
    searchInput2.value = entry.listing_fields?.Name ?? id;
    combobox2.closeDropdown();
    markSelectedOption(listbox2, button);
    await onPersist();
    await refresh(searchInput.value);
  }

  const combobox = attachComboboxBehavior(searchInput, listbox, refresh);
  const combobox2 = attachComboboxBehavior(searchInput2, listbox2, refreshSecondary);

  hybridCheckbox.addEventListener('change', async () => {
    const on = hybridCheckbox.checked;
    character.selections.classHybrid = on;
    secondaryWrap.hidden = !on;
    if (on) {
      if (character.selections.classId) character.selections.hybridClassIds[0] = character.selections.classId;
    } else {
      character.selections.hybridClassIds = character.selections.classId
        ? [character.selections.classId]
        : [];
      searchInput2.value = '';
    }
    await onPersist();
    await refresh(searchInput.value);
    if (on) await refreshSecondary('');
  });

  attachSourceCombo(panel, PICKER_KEY, () => {
    refresh(searchInput.value);
    if (isHybridMode()) refreshSecondary(searchInput2.value);
  });

  renderTutorHint?.(panel);
  await refresh();
  if (isHybridMode()) await refreshSecondary();

  const initialId = getSelectedId();
  if (initialId) {
    await setComboboxInputFromEntry(searchInput, compendium, initialId);
    const entry = await compendium.getEntry(initialId);
    if (entry) {
      currentEntry = entry;
      refreshPreview(entry);
    }
  }

  const initialSecondaryId = character.selections.hybridClassIds?.[1] ?? null;
  if (initialSecondaryId) {
    await setComboboxInputFromEntry(searchInput2, compendium, initialSecondaryId);
  }
}
