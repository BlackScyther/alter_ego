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

  panel.innerHTML = `
    <div class="compendium-picker class-step" data-category="class">
      <div class="picker-toolbar">
        <div class="picker-toolbar-row">
          ${renderSourceComboHtml({ pickerKey: PICKER_KEY, sourceBooks, groupLabel: 'Class source' })}
        </div>
        ${renderComboboxHtml({
          inputId: 'picker-search',
          listboxId: 'picker-listbox',
          placeholder: `Select ${def.title}`,
          visibleLabel: def.title
        })}
      </div>
      <div class="class-step-body">
        <div class="entry-preview" id="entry-preview"></div>
      </div>
      <p class="picker-done-hint hidden" id="picker-class-done-hint">Class choices complete.</p>
    </div>`;

  const listbox = panel.querySelector('#picker-listbox');
  const preview = panel.querySelector('#entry-preview');
  const searchInput = panel.querySelector('#picker-search');
  /** @type {object | null} */
  let currentEntry = null;

  async function loadClassPool(query) {
    const sourceFilter = getActiveSourceBooksFromCombo(PICKER_KEY);
    const q = query.trim();
    return compendium.listEntries('class', {
      search: q.length >= COMPENDIUM_SEARCH_MIN ? q : '',
      limit: LIST_LIMIT,
      sourceBooks: sourceFilter ?? undefined
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

  async function refresh(query = '') {
    const q = query.trim();

    if (q.length > 0 && q.length < COMPENDIUM_SEARCH_MIN) {
      const pool = await loadClassPool('');
      const narrowed = filterEntriesBySearch(pool, q);
      if (narrowed.length > 0) {
        renderPickerOptions(listbox, narrowed, getSelectedId(), onPick, (e) =>
          formatClassListingMeta(e.listing_fields)
        );
        return;
      }
      showIdleHint(listbox, def.title);
      return;
    }

    const shown = await loadClassPool(q);
    if (!shown.length) {
      renderPickerOptions(listbox, [], getSelectedId(), onPick, (e) => formatClassListingMeta(e.listing_fields));
      return;
    }

    renderPickerOptions(listbox, shown.slice(0, LIST_LIMIT), getSelectedId(), onPick, (e) =>
      formatClassListingMeta(e.listing_fields)
    );
  }

  async function onPick(id, button) {
    const entry = await compendium.getEntry(id);
    if (!entry) return;
    if (character.selections.classId !== id) {
      resetClassDerivedSelections(character);
    }
    currentEntry = entry;
    applySelection('class', entry);
    await syncClassState(entry);
    searchInput.value = entry.listing_fields?.Name ?? id;
    combobox.closeDropdown();
    listbox.querySelectorAll('.picker-option').forEach((r) => {
      r.classList.remove('picker-option--selected');
      r.setAttribute('aria-selected', 'false');
    });
    button.classList.add('picker-option--selected');
    button.setAttribute('aria-selected', 'true');
  }

  const combobox = attachComboboxBehavior(searchInput, listbox, refresh);

  attachSourceCombo(panel, PICKER_KEY, () => refresh(searchInput.value));

  renderTutorHint?.(panel);
  await refresh();

  const initialId = getSelectedId();
  if (initialId) {
    await setComboboxInputFromEntry(searchInput, compendium, initialId);
    const entry = await compendium.getEntry(initialId);
    if (entry) {
      currentEntry = entry;
      refreshPreview(entry);
    }
  }
}
