import { escapeHtml as esc } from '../../shared/escape-html.js';

/** @type {Map<string, { allChecked: boolean, sourceBook: string, dateCutoff: string }>} */
const sessionState = new Map();

/**
 * @param {string} pickerKey
 */
function getState(pickerKey) {
  if (!sessionState.has(pickerKey)) {
    sessionState.set(pickerKey, { allChecked: true, sourceBook: '', dateCutoff: '' });
  }
  return sessionState.get(pickerKey);
}

/**
 * Codes whose release_date is known and on or before the cutoff (ISO dates
 * compare lexicographically). Books with a null date are excluded.
 * @param {Record<string, { release_date?: string|null }> | null | undefined} dateMap
 * @param {string} cutoff - ISO YYYY-MM-DD
 * @returns {string[]}
 */
export function resolveSourceBooksByDate(dateMap, cutoff) {
  if (!dateMap || !cutoff) return [];
  return Object.entries(dateMap)
    .filter(([, meta]) => meta?.release_date && meta.release_date <= cutoff)
    .map(([code]) => code);
}

/**
 * Resolve the active source-book filter list. When a date cutoff is set (and a
 * `dateMap` is supplied) the result is restricted to books released on or
 * before the cutoff, intersected with any single-source selection.
 * @param {string} pickerKey
 * @param {Record<string, { release_date?: string|null }> | null} [dateMap]
 * @returns {string[] | null} null means "all sources"
 */
export function getActiveSourceBooksFromCombo(pickerKey, dateMap = null) {
  const { allChecked, sourceBook, dateCutoff } = getState(pickerKey);
  const base = allChecked || !sourceBook ? null : [sourceBook];

  if (!dateCutoff || !dateMap) return base;

  const byDate = resolveSourceBooksByDate(dateMap, dateCutoff);
  if (!base) return byDate;
  const allowed = new Set(byDate);
  return base.filter((b) => allowed.has(b));
}

/**
 * @param {object} opts
 * @param {string} opts.pickerKey
 * @param {string[]} opts.sourceBooks
 * @param {string} [opts.groupLabel]
 * @param {boolean} [opts.showDate] - render the "released on/before" date filter
 */
export function renderSourceComboHtml({ pickerKey, sourceBooks, groupLabel = 'Source', showDate = false }) {
  const { allChecked, sourceBook, dateCutoff } = getState(pickerKey);
  const options = sourceBooks
    .map((book) => {
      const selected = book === sourceBook ? ' selected' : '';
      return `<option value="${esc(book)}"${selected}>${esc(book)}</option>`;
    })
    .join('');

  const dateControl = showDate
    ? `<label class="picker-source-date-label">
      <span class="picker-source-date-caption">Released on/before</span>
      <input type="date" data-source-date value="${esc(dateCutoff)}" aria-label="Released on or before date" />
    </label>`
    : '';

  return `<div class="picker-source-combo" data-picker-key="${esc(pickerKey)}" role="group" aria-label="${esc(groupLabel)} filter">
    <label class="picker-source-all">
      <input type="checkbox" data-source-all${allChecked ? ' checked' : ''} />
      <span>All</span>
    </label>
    <label class="picker-source-select-label">
      <span class="picker-source-select-caption">${esc(groupLabel)}</span>
      <select data-source-select aria-label="${esc(groupLabel)}">
        <option value=""${!sourceBook ? ' selected' : ''}>NONE</option>
        ${options}
      </select>
    </label>
    ${dateControl}
  </div>`;
}

/**
 * @param {HTMLElement} root
 * @param {string} pickerKey
 * @param {() => void} onChange
 */
export function attachSourceCombo(root, pickerKey, onChange) {
  const wrap = root.querySelector(`.picker-source-combo[data-picker-key="${pickerKey}"]`);
  if (!wrap) return;

  const state = getState(pickerKey);
  const allInput = wrap.querySelector('[data-source-all]');
  const sourceSelect = wrap.querySelector('[data-source-select]');
  const dateInput = wrap.querySelector('[data-source-date]');
  if (!allInput || !sourceSelect) return;

  const syncUi = () => {
    allInput.checked = state.allChecked;
    sourceSelect.value = state.sourceBook;
    if (dateInput) dateInput.value = state.dateCutoff;
  };

  if (dateInput) {
    dateInput.addEventListener('change', () => {
      state.dateCutoff = dateInput.value || '';
      onChange();
    });
  }

  allInput.addEventListener('change', () => {
    if (allInput.checked) {
      state.allChecked = true;
      state.sourceBook = '';
    } else {
      state.allChecked = false;
    }
    syncUi();
    onChange();
  });

  sourceSelect.addEventListener('change', () => {
    const book = sourceSelect.value;
    if (book) {
      state.allChecked = false;
      state.sourceBook = book;
    } else {
      state.allChecked = true;
      state.sourceBook = '';
    }
    syncUi();
    onChange();
  });

  syncUi();
}
