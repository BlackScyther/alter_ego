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
import { formatThemePickerMeta, renderThemePreviewHtml } from '../../character/theme-parse.js';
import { resolveThemePreviewLinks, validateThemeStep } from '../../character/theme-selections.js';
import {
  THEME_SETTINGS,
  buildThemeEligibilityContext,
  getThemeFilterMode,
  getThemeSettingFilter,
  setThemeFilterMode,
  setThemeSettingFilter,
  themePassesFilters
} from '../theme-prerequisite.js';

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
  const filterMode = getThemeFilterMode();
  const settingId = getThemeSettingFilter();
  const settingOptions = THEME_SETTINGS.map(
    (setting) =>
      `<option value="${setting.id}"${setting.id === settingId ? ' selected' : ''}>${setting.label}</option>`
  ).join('');

  panel.innerHTML = `
    <div class="compendium-picker" data-category="theme">
      <div class="picker-toolbar">
        <div class="picker-toolbar-row">
          <label class="picker-theme-filter">
            <span class="picker-theme-filter-label">Prerequisites</span>
            <select id="picker-theme-filter" aria-label="Filter themes by prerequisites">
              <option value="eligible"${filterMode === 'eligible' ? ' selected' : ''}>Eligible</option>
              <option value="all"${filterMode === 'all' ? ' selected' : ''}>All</option>
            </select>
          </label>
          <label class="picker-theme-filter">
            <span class="picker-theme-filter-label">Setting</span>
            <select id="picker-theme-setting" aria-label="Filter themes by setting">
              ${settingOptions}
            </select>
          </label>
        </div>
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
      <p class="theme-prereq-warning" id="theme-prereq-warning" role="status" hidden></p>
      <div class="entry-preview" id="entry-preview"></div>
    </div>`;

  const listbox = panel.querySelector('#picker-listbox');
  const preview = panel.querySelector('#entry-preview');
  const searchInput = panel.querySelector('#picker-search');
  const filterSelect = panel.querySelector('#picker-theme-filter');
  const settingSelect = panel.querySelector('#picker-theme-setting');
  const warning = panel.querySelector('#theme-prereq-warning');
  /** @type {object | null} */
  let currentEntry = null;
  /** @type {import('../theme-prerequisite.js').ThemeEligibilityContext} */
  let eligibilityCtx = {};

  let previewToken = 0;
  async function refreshPreview(entry) {
    const token = ++previewToken;
    if (!entry) {
      preview.innerHTML = '';
      return;
    }
    const links = await resolveThemePreviewLinks(entry, compendium, location.pathname);
    if (token !== previewToken) return;
    preview.innerHTML = renderThemePreviewHtml(entry, {
      level: character.identity?.level,
      links
    });
  }

  function showPrerequisiteWarning(entry) {
    const messages = validateThemeStep(character, entry, eligibilityCtx);
    if (!warning) return;
    if (!messages.length) {
      warning.hidden = true;
      warning.textContent = '';
      return;
    }
    warning.hidden = false;
    warning.textContent = messages.join(' ');
  }

  function rowMeta(entry) {
    return formatThemePickerMeta(entry);
  }

  function applyListFilters(entries) {
    return entries.filter((entry) =>
      themePassesFilters(entry, {
        mode: getThemeFilterMode(),
        settingId: getThemeSettingFilter(),
        ctx: eligibilityCtx
      })
    );
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
    eligibilityCtx = await buildThemeEligibilityContext(character, compendium);
    const q = query.trim();
    if (q.length > 0 && q.length < COMPENDIUM_SEARCH_MIN) {
      const pool = applyListFilters(await loadPool(''));
      const narrowed = filterEntriesBySearch(pool, q);
      if (narrowed.length) {
        renderPickerOptions(listbox, narrowed.slice(0, 100), getSelectedId(), onPick, rowMeta);
      } else {
        showIdleHint(listbox, def.title);
      }
      if (currentEntry) showPrerequisiteWarning(currentEntry);
      return;
    }

    const shown = applyListFilters(await loadPool(q));
    renderPickerOptions(listbox, shown.slice(0, 150), getSelectedId(), onPick, rowMeta);
    if (currentEntry) showPrerequisiteWarning(currentEntry);
  }

  async function onPick(id, button) {
    const entry = await compendium.getEntry(id);
    if (!entry) return;
    applySelection('theme', entry);
    await refreshBonuses();
    currentEntry = entry;
    searchInput.value = entry.listing_fields?.Name ?? id;
    combobox.closeDropdown();
    listbox.querySelectorAll('.picker-option').forEach((row) => {
      row.classList.remove('picker-option--selected');
      row.setAttribute('aria-selected', 'false');
    });
    button.classList.add('picker-option--selected');
    button.setAttribute('aria-selected', 'true');
    refreshPreview(entry);
    showPrerequisiteWarning(entry);
    await onPersist();
  }

  const combobox = attachComboboxBehavior(searchInput, listbox, refresh);
  attachSourceCombo(panel, PICKER_KEY, () => {
    refresh(searchInput.value);
  });
  filterSelect?.addEventListener('change', () => {
    const value = filterSelect.value === 'all' ? 'all' : 'eligible';
    setThemeFilterMode(value);
    refresh(searchInput.value);
  });
  settingSelect?.addEventListener('change', () => {
    setThemeSettingFilter(settingSelect.value || 'all');
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
      showPrerequisiteWarning(entry);
      await refreshBonuses();
      await onPersist();
    }
  }
}
