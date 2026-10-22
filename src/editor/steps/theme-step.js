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
import { formatThemeListingMeta, renderThemePreviewHtml } from '../../character/theme-parse.js';

const PICKER_KEY = 'theme';
const LIST_LIMIT = 200;

/**
 * @param {HTMLElement} panel
 * @param {object} ctx
 * @param {import('../../character/model.js').Character} ctx.character
 * @param {import('../../data/compendium.js').CompendiumProvider} ctx.compendium
 * @param {object} ctx.def
 * @param {(stepId: string, entry: object) => void} ctx.applySelection
 * @param {() => Promise<void>} ctx.onPersist
 * @param {() => Promise<void>} ctx.refreshBonuses
 * @param {(panel: HTMLElement) => void} [ctx.renderTutorHint]
 */
export async function renderThemeStep(panel, ctx) {
  const { character, compendium, def, applySelection, onPersist, refreshBonuses, renderTutorHint } = ctx;
  const sourceBooks = await compendium.distinctSourceBooks('theme');
  const getSelectedId = () => character.selections.themeId ?? null;

  panel.innerHTML = `
    <div class="compendium-picker" data-category="theme">
      <div class="picker-toolbar">
        <div class="picker-toolbar-row">
          ${renderSourceComboHtml({ pickerKey: PICKER_KEY, sourceBooks, groupLabel: 'Theme source' })}
        </div>
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

  function refreshPreview(entry) {
    if (!entry) {
      preview.innerHTML = '';
      return;
    }
    preview.innerHTML = renderThemePreviewHtml(entry, {
      level: character.identity?.level
    });
  }

  async function loadPool(query) {
    const sourceFilter = getActiveSourceBooksFromCombo(PICKER_KEY);
    const q = query.trim();
    return compendium.listEntries('theme', {
      search: q.length >= COMPENDIUM_SEARCH_MIN ? q : '',
      limit: LIST_LIMIT,
      sourceBooks: sourceFilter ?? undefined
    });
  }

  async function refresh(query = '') {
    const q = query.trim();
    if (q.length > 0 && q.length < COMPENDIUM_SEARCH_MIN) {
      const pool = await loadPool('');
      const narrowed = filterEntriesBySearch(pool, q);
      if (narrowed.length) {
        renderPickerOptions(listbox, narrowed.slice(0, 100), getSelectedId(), onPick, (entry) =>
          formatThemeListingMeta(entry.listing_fields)
        );
        return;
      }
      showIdleHint(listbox, def.title);
      return;
    }

    const shown = await loadPool(q);
    renderPickerOptions(listbox, shown.slice(0, 150), getSelectedId(), onPick, (entry) =>
      formatThemeListingMeta(entry.listing_fields)
    );
  }

  async function onPick(id, button) {
    const entry = await compendium.getEntry(id);
    if (!entry) return;
    applySelection('theme', entry);
    await refreshBonuses();
    searchInput.value = entry.listing_fields?.Name ?? id;
    combobox.closeDropdown();
    listbox.querySelectorAll('.picker-option').forEach((row) => {
      row.classList.remove('picker-option--selected');
      row.setAttribute('aria-selected', 'false');
    });
    button.classList.add('picker-option--selected');
    button.setAttribute('aria-selected', 'true');
    refreshPreview(entry);
    await onPersist();
  }

  const combobox = attachComboboxBehavior(searchInput, listbox, refresh);
  attachSourceCombo(panel, PICKER_KEY, () => {
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
      await refreshBonuses();
      await onPersist();
    }
  }
}
