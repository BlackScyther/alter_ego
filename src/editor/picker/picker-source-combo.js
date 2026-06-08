import { escapeHtml as esc } from '../../shared/escape-html.js';

/** @type {Map<string, { allChecked: boolean, sourceBook: string }>} */
const sessionState = new Map();

/**
 * @param {string} pickerKey
 */
function getState(pickerKey) {
  if (!sessionState.has(pickerKey)) {
    sessionState.set(pickerKey, { allChecked: true, sourceBook: '' });
  }
  return sessionState.get(pickerKey);
}

/**
 * @param {string} pickerKey
 * @returns {string[] | null}
 */
export function getActiveSourceBooksFromCombo(pickerKey) {
  const { allChecked, sourceBook } = getState(pickerKey);
  if (allChecked || !sourceBook) return null;
  return [sourceBook];
}

/**
 * @param {object} opts
 * @param {string} opts.pickerKey
 * @param {string[]} opts.sourceBooks
 * @param {string} [opts.groupLabel]
 */
export function renderSourceComboHtml({ pickerKey, sourceBooks, groupLabel = 'Source' }) {
  const { allChecked, sourceBook } = getState(pickerKey);
  const options = sourceBooks
    .map((book) => {
      const selected = book === sourceBook ? ' selected' : '';
      return `<option value="${esc(book)}"${selected}>${esc(book)}</option>`;
    })
    .join('');

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
  if (!allInput || !sourceSelect) return;

  const syncUi = () => {
    allInput.checked = state.allChecked;
    sourceSelect.value = state.sourceBook;
  };

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
