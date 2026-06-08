import { escapeHtml as esc } from '../../shared/escape-html.js';

/** Card button classes per rules/ui.md */
export const PICKER_CARD =
  'picker-btn w-full min-h-11 rounded-lg border border-slate-600 bg-slate-800 px-4 py-3 text-left text-base font-medium text-slate-100 hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500';

export const PICKER_CARD_SELECTED = 'ring-2 ring-amber-500/80';

export const PICKER_LIST = 'picker-list flex flex-col gap-2 w-full max-w-xl';

/**
 * @param {boolean} [selected]
 * @returns {string}
 */
export function pickerCardClass(selected = false) {
  return `${PICKER_CARD}${selected ? ` ${PICKER_CARD_SELECTED}` : ''}`;
}

/**
 * @param {string} name
 * @param {string} meta
 * @param {boolean} [selected]
 * @returns {string}
 */
export function pickerCardHtml(name, meta, selected = false) {
  return `<button type="button" class="${pickerCardClass(selected)}">
    <span class="block">${esc(name)}</span>
    <span class="block text-sm font-normal text-slate-400">${esc(meta)}</span>
  </button>`;
}

/**
 * @param {HTMLElement} btn
 * @param {boolean} selected
 */
export function setPickerCardSelected(btn, selected) {
  btn.classList.toggle('ring-2', selected);
  btn.classList.toggle('ring-amber-500/80', selected);
}

/**
 * @param {ParentNode} root
 */
export function clearPickerCardSelection(root) {
  root.querySelectorAll('.picker-btn').forEach((btn) => setPickerCardSelected(btn, false));
}
