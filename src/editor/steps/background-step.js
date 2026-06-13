import {
  getBackgroundRaceFilterMode,
  setBackgroundRaceFilterMode,
  getRaceMatchTerms,
  filterBackgroundEntries,
  formatBackgroundListingMeta
} from '../background-prerequisite.js';
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
  renderBackgroundPreviewHtml,
  buildBackgroundNotesText,
  parseBackgroundEntry
} from '../../character/background-parse.js';
import {
  ensureBackgroundSelectionsShape,
  resetBackgroundBonusChoices,
  setBackgroundSkillMode,
  toggleBackgroundSkillChoice
} from '../../character/background-selections.js';
import { setBackgroundHpSubstituteAbility } from '../../character/background-effect-selections.js';
import { escapeHtml as esc } from '../../shared/escape-html.js';

const LIST_LIMIT = 500;

/**
 * @param {HTMLElement} previewEl
 * @param {(mode: 'plus2-one' | 'plus1-two') => void} onModeChange
 * @param {(skillId: string) => void} onSkillToggle
 */
function attachPreviewSkillChoices(previewEl, onModeChange, onSkillToggle, onHpAbilityPick) {
  if (!previewEl || previewEl.dataset.skillDelegation) return;
  previewEl.dataset.skillDelegation = 'true';

  previewEl.addEventListener('change', (e) => {
    const input = e.target;
    if (input?.name === 'background-skill-mode' && input.checked) {
      onModeChange(input.value);
    }
  });

  previewEl.addEventListener('click', (e) => {
    const skillBtn = e.target.closest('.background-skill-btn');
    if (skillBtn) {
      const skillId = skillBtn.dataset.skill;
      if (skillId) onSkillToggle(skillId);
      return;
    }
    const hpBtn = e.target.closest('.background-hp-ability-btn');
    if (hpBtn) {
      const ability = hpBtn.dataset.ability;
      if (ability) onHpAbilityPick(ability);
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
 */
export async function renderBackgroundStep(panel, ctx) {
  const { character, compendium, def, applySelection, getNotes, setNotes, onPersist, refreshBonuses, renderTutorHint } =
    ctx;
  ensureBackgroundSelectionsShape(character);
  const filterMode = getBackgroundRaceFilterMode();
  const getSelectedId = () => character.selections.backgroundId ?? null;

  panel.innerHTML = `
    <div class="compendium-picker" data-category="background">
      <div class="picker-toolbar">
        <label class="picker-race-filter">
          <span class="picker-race-filter-label">Race filter</span>
          <select id="picker-race-filter" aria-label="Filter backgrounds by race prerequisites">
            <option value="all"${filterMode === 'all' ? ' selected' : ''}>All</option>
            <option value="eligible"${filterMode === 'eligible' ? ' selected' : ''}>Eligible</option>
            <option value="own-race"${filterMode === 'own-race' ? ' selected' : ''}>Own race only</option>
          </select>
        </label>
        ${renderComboboxHtml({
          inputId: 'picker-search',
          listboxId: 'picker-listbox',
          placeholder: `Select ${def.title}`,
          visibleLabel: def.title
        })}
      </div>
      <div class="entry-preview" id="entry-preview"></div>
    </div>`;

  const listbox = panel.querySelector('#picker-listbox');
  const preview = panel.querySelector('#entry-preview');
  const searchInput = panel.querySelector('#picker-search');
  const raceFilterSelect = panel.querySelector('#picker-race-filter');
  let raceTerms = await getRaceMatchTerms(character, compendium);
  /** @type {object | null} */
  let currentEntry = null;

  function refreshPreview(entry) {
    if (!entry) {
      preview.innerHTML = '';
      return;
    }
    preview.innerHTML = renderBackgroundPreviewHtml(entry, {
      choices: character.selections.backgroundBonusChoices,
      effectChoices: character.selections.backgroundEffectChoices
    });
  }

  async function syncNotesFromEntry(entry) {
    if (!entry) return;
    const text = buildBackgroundNotesText(
      entry,
      character.selections.backgroundBonusChoices,
      character.selections.backgroundEffectChoices
    );
    if (text) setNotes(text);
  }

  async function afterChoiceChange() {
    if (!currentEntry) return;
    refreshPreview(currentEntry);
    await syncNotesFromEntry(currentEntry);
    await refreshBonuses();
    await onPersist();
  }

  attachPreviewSkillChoices(
    preview,
    (mode) => {
      const parsed = parseBackgroundEntry(currentEntry);
      setBackgroundSkillMode(character, mode, parsed);
      afterChoiceChange();
    },
    (skillId) => {
      const parsed = parseBackgroundEntry(currentEntry);
      toggleBackgroundSkillChoice(character, skillId, parsed);
      afterChoiceChange();
    },
    (ability) => {
      setBackgroundHpSubstituteAbility(character, ability);
      afterChoiceChange();
    }
  );

  async function loadFilteredEntries() {
    const raw = await compendium.listEntries('background', { limit: LIST_LIMIT });
    const mode = getBackgroundRaceFilterMode();
    raceTerms = await getRaceMatchTerms(character, compendium);
    return filterBackgroundEntries(raw, mode, raceTerms);
  }

  async function refresh(query = '') {
    const q = query.trim();
    const filtered = await loadFilteredEntries();

    if (q.length > 0 && q.length < COMPENDIUM_SEARCH_MIN) {
      const narrowed = filterEntriesBySearch(filtered, q);
      if (narrowed.length > 0) {
        renderPickerOptions(listbox, narrowed, getSelectedId(), onPick, (e) =>
          formatBackgroundListingMeta(e.listing_fields, e)
        );
        return;
      }
      showIdleHint(listbox, def.title);
      return;
    }

    let shown = filtered;
    if (q.length >= COMPENDIUM_SEARCH_MIN) {
      const searched = await compendium.listEntries('background', { search: q, limit: 100 });
      const mode = getBackgroundRaceFilterMode();
      raceTerms = await getRaceMatchTerms(character, compendium);
      shown = filterBackgroundEntries(searched, mode, raceTerms);
    } else if (q.length > 0) {
      shown = filterEntriesBySearch(filtered, q);
    }

    if (!shown.length) {
      renderPickerOptions(listbox, [], getSelectedId(), onPick, (e) =>
        formatBackgroundListingMeta(e.listing_fields, e)
      );
      return;
    }

    renderPickerOptions(listbox, shown.slice(0, 100), getSelectedId(), onPick, (e) =>
      formatBackgroundListingMeta(e.listing_fields, e)
    );
  }

  async function onPick(id, button) {
    const entry = await compendium.getEntry(id);
    if (!entry) return;
    resetBackgroundBonusChoices(character);
    applySelection('background', entry);
    currentEntry = entry;
    await refreshBonuses();
    searchInput.value = entry.listing_fields?.Name ?? id;
    combobox.closeDropdown();
    listbox.querySelectorAll('.picker-option').forEach((r) => {
      r.classList.remove('picker-option--selected');
      r.setAttribute('aria-selected', 'false');
    });
    button.classList.add('picker-option--selected');
    button.setAttribute('aria-selected', 'true');
    refreshPreview(entry);
    if (!getNotes()) await syncNotesFromEntry(entry);
    await onPersist();
  }

  const combobox = attachComboboxBehavior(searchInput, listbox, refresh);

  raceFilterSelect.addEventListener('change', () => {
    setBackgroundRaceFilterMode(raceFilterSelect.value);
    refresh(searchInput.value);
  });

  renderTutorHint?.(panel);
  await refresh();

  const initialId = getSelectedId();
  if (initialId) {
    await setComboboxInputFromEntry(searchInput, compendium, initialId);
    const entry = await compendium.getEntry(initialId);
    if (entry) {
      currentEntry = entry;
      refreshPreview(entry);
      await syncNotesFromEntry(entry);
    }
  }
}
