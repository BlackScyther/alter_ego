import { escapeHtml as esc } from '../../shared/escape-html.js';

/** @type {Map<string, Set<string>>} */
const sessionSelections = new Map();

/**
 * @param {Array<{ id: string, label: string, default?: boolean, sourceBooks?: string[] }>} filters
 */
function defaultFilterSet(filters) {
  const def = filters.find((f) => f.default) ?? filters[0];
  return new Set(def ? [def.id] : []);
}

/**
 * @param {string} pickerKey
 * @param {Array<{ id: string, label: string, default?: boolean, sourceBooks?: string[] }>} filters
 */
export function getSourceFilterSelection(pickerKey, filters) {
  if (!sessionSelections.has(pickerKey)) {
    sessionSelections.set(pickerKey, defaultFilterSet(filters));
  }
  return sessionSelections.get(pickerKey);
}

/**
 * @param {string} pickerKey
 * @param {Array<{ id: string, label: string, default?: boolean, sourceBooks?: string[] }>} filters
 * @returns {string[] | null}
 */
export function getActiveSourceBooks(pickerKey, filters) {
  const selected = getSourceFilterSelection(pickerKey, filters);
  const allFilter = filters.find((f) => !Array.isArray(f.sourceBooks));
  if (allFilter && selected.has(allFilter.id)) return null;

  const books = [];
  for (const f of filters) {
    if (!Array.isArray(f.sourceBooks)) continue;
    if (selected.has(f.id)) books.push(...f.sourceBooks);
  }
  return books.length ? [...new Set(books)] : null;
}

/**
 * @param {string} pickerKey
 * @param {Array<{ id: string, label: string, default?: boolean, sourceBooks?: string[] }>} filters
 * @param {string} [groupLabel]
 */
export function renderSourceFiltersHtml(pickerKey, filters, groupLabel = 'Source') {
  const selected = getSourceFilterSelection(pickerKey, filters);
  const allId = filters.find((f) => !Array.isArray(f.sourceBooks))?.id ?? null;

  const inputs = filters
    .map((f) => {
      const checked = selected.has(f.id) ? ' checked' : '';
      return `<label class="picker-source-filter">
        <input type="checkbox" data-source-filter="${esc(f.id)}"${checked} />
        <span>${esc(f.label)}</span>
      </label>`;
    })
    .join('');

  return `<div class="picker-source-filters" data-picker-key="${esc(pickerKey)}" role="group" aria-label="${esc(groupLabel)} filter">
    <span class="picker-source-filters-label">${esc(groupLabel)}</span>
    <div class="picker-source-filters-options">${inputs}</div>
  </div>`;
}

/**
 * @param {HTMLElement} root
 * @param {string} pickerKey
 * @param {Array<{ id: string, label: string, default?: boolean, sourceBooks?: string[] }>} filters
 * @param {() => void} onChange
 */
export function attachSourceFilters(root, pickerKey, filters, onChange) {
  const wrap = root.querySelector(`.picker-source-filters[data-picker-key="${pickerKey}"]`);
  if (!wrap) return;

  const allId = filters.find((f) => !Array.isArray(f.sourceBooks))?.id ?? null;
  const selected = getSourceFilterSelection(pickerKey, filters);

  const syncUi = () => {
    wrap.querySelectorAll('input[data-source-filter]').forEach((input) => {
      input.checked = selected.has(input.dataset.sourceFilter);
    });
  };

  wrap.querySelectorAll('input[data-source-filter]').forEach((input) => {
    input.addEventListener('change', () => {
      const id = input.dataset.sourceFilter;
      if (id === allId) {
        selected.clear();
        if (allId) selected.add(allId);
      } else if (input.checked) {
        if (allId) selected.delete(allId);
        selected.add(id);
      } else {
        selected.delete(id);
        if (selected.size === 0 && allId) selected.add(allId);
      }
      syncUi();
      onChange();
    });
  });

  syncUi();
}
