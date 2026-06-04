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
import { escapeHtml as esc } from '../../shared/escape-html.js';

const LIST_LIMIT = 500;

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
    </div>
    <div class="field" style="margin-top:12px">
      <label>Notes (features text)</label>
      <textarea id="step-notes" rows="4">${esc(getNotes())}</textarea>
    </div>`;

  const listbox = panel.querySelector('#picker-listbox');
  const preview = panel.querySelector('#entry-preview');
  const searchInput = panel.querySelector('#picker-search');
  const raceFilterSelect = panel.querySelector('#picker-race-filter');

  let raceTerms = await getRaceMatchTerms(character, compendium);

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
    applySelection('background', entry);
    await refreshBonuses();
    searchInput.value = entry.listing_fields?.Name ?? id;
    combobox.closeDropdown();
    listbox.querySelectorAll('.picker-option').forEach((r) => {
      r.classList.remove('picker-option--selected');
      r.setAttribute('aria-selected', 'false');
    });
    button.classList.add('picker-option--selected');
    button.setAttribute('aria-selected', 'true');
    preview.innerHTML = entry.body_html ?? '';
    panel.querySelector('#step-notes').value = getNotes();
    await onPersist();
  }

  const combobox = attachComboboxBehavior(searchInput, listbox, refresh);

  raceFilterSelect.addEventListener('change', () => {
    setBackgroundRaceFilterMode(raceFilterSelect.value);
    refresh(searchInput.value);
  });

  panel.querySelector('#step-notes').addEventListener('input', (e) => {
    setNotes(e.target.value);
    onPersist();
  });

  renderTutorHint?.(panel);
  await refresh();

  const initialId = getSelectedId();
  if (initialId) {
    await setComboboxInputFromEntry(searchInput, compendium, initialId);
    const entry = await compendium.getEntry(initialId);
    if (entry) preview.innerHTML = entry.body_html ?? '';
  }
}
