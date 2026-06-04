import { escapeHtml as esc } from '../../shared/escape-html.js';

export const COMPENDIUM_SEARCH_MIN = 3;

const DROPDOWN_CLASS = 'picker-dropdown';
const PANEL_CLASS = 'picker-dropdown-panel';

let dropdownListenersInstalled = false;

function positionDropdown(input, dropdown) {
  const rect = input.getBoundingClientRect();
  dropdown.style.position = 'fixed';
  dropdown.style.left = `${rect.left}px`;
  dropdown.style.top = `${rect.bottom + 4}px`;
  dropdown.style.width = `${rect.width}px`;
  dropdown.style.right = 'auto';
  dropdown.style.zIndex = '10050';
}

function clearDropdownPosition(dropdown) {
  dropdown.style.position = '';
  dropdown.style.left = '';
  dropdown.style.top = '';
  dropdown.style.width = '';
  dropdown.style.right = '';
  dropdown.style.zIndex = '';
}

function setDropdownOpen(input, dropdown, open) {
  const wrap = input.closest('.picker-combobox');
  input.setAttribute('aria-expanded', open ? 'true' : 'false');
  const toggle = wrap?.querySelector('.picker-combobox-toggle');
  toggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) {
    positionDropdown(input, dropdown);
    dropdown.hidden = false;
  } else {
    dropdown.hidden = true;
    clearDropdownPosition(dropdown);
  }
  wrap?.classList.toggle('picker-combobox--open', open);
}

function installDropdownListeners() {
  if (dropdownListenersInstalled) return;
  dropdownListenersInstalled = true;
  const reposition = () => {
    document.querySelectorAll('.picker-combobox--open').forEach((wrap) => {
      const input = wrap.querySelector('.picker-combobox-input');
      const dropdown = wrap.querySelector('.picker-dropdown');
      if (input && dropdown && !dropdown.hidden) positionDropdown(input, dropdown);
    });
  };
  window.addEventListener('resize', reposition, { passive: true });
  document.getElementById('step-panel')?.addEventListener('scroll', reposition, { passive: true });
}

/**
 * @param {HTMLElement} listbox
 * @param {string} extraClass
 */
function setListboxPanelClass(listbox, extraClass = '') {
  listbox.className = [DROPDOWN_CLASS, PANEL_CLASS, extraClass].filter(Boolean).join(' ');
}

/**
 * @param {HTMLElement} listbox
 * @param {string} categoryLabel
 */
function showIdleHint(listbox, categoryLabel) {
  listbox.innerHTML = `<p class="picker-dropdown-hint" role="presentation">${esc(`Type at least ${COMPENDIUM_SEARCH_MIN} characters to search ${categoryLabel}, or open the list.`)}</p>`;
  setListboxPanelClass(listbox, 'picker-dropdown-panel--idle');
}

/**
 * @param {HTMLElement} listbox
 * @param {string} message
 */
function showEmptyHint(listbox, message) {
  listbox.innerHTML = `<p class="picker-dropdown-hint" role="presentation">${esc(message)}</p>`;
  setListboxPanelClass(listbox, 'picker-dropdown-panel--idle');
}

/**
 * @param {Array<{ id: string, listing_fields?: Record<string, string>, index_text?: string }>} entries
 * @param {string} query
 */
export function filterEntriesBySearch(entries, query) {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter((e) => {
    const name = (e.listing_fields?.Name ?? e.id).toLowerCase();
    const index = (e.index_text ?? '').toLowerCase();
    return name.includes(q) || index.includes(q);
  });
}

/**
 * @param {object} opts
 * @param {string} opts.inputId
 * @param {string} opts.listboxId
 * @param {string} opts.placeholder
 * @param {string} [opts.visibleLabel]
 */
export function renderComboboxHtml({ inputId, listboxId, placeholder, visibleLabel }) {
  const labelHtml = visibleLabel
    ? `<label class="picker-combobox-label" for="${esc(inputId)}">${esc(visibleLabel)}</label>`
    : '';
  return `
    <div class="picker-combobox">
      ${labelHtml}
      <div class="picker-combobox-control">
        <input
          type="search"
          id="${esc(inputId)}"
          class="picker-combobox-input"
          placeholder="${esc(placeholder)}"
          autocomplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-controls="${esc(listboxId)}"
          aria-expanded="false"
        />
        <button type="button" class="picker-combobox-toggle" tabindex="-1" aria-label="Open list" aria-expanded="false">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="m6 9 6 6 6-6"/>
          </svg>
        </button>
      </div>
      <div id="${esc(listboxId)}" class="${DROPDOWN_CLASS}" role="listbox" hidden></div>
    </div>`;
}

/**
 * @param {HTMLInputElement} input
 * @param {HTMLElement} listbox
 * @param {(query: string) => void} onQuery
 */
export function attachComboboxBehavior(input, listbox, onQuery) {
  installDropdownListeners();

  const open = () => {
    setDropdownOpen(input, listbox, true);
    onQuery(input.value);
  };
  const close = () => setDropdownOpen(input, listbox, false);

  input.addEventListener('focus', open);
  input.addEventListener('input', open);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      close();
      input.blur();
    }
  });
  input.addEventListener('blur', () => window.setTimeout(close, 160));
  listbox.addEventListener('mousedown', (e) => e.preventDefault());

  const toggle = input.closest('.picker-combobox')?.querySelector('.picker-combobox-toggle');
  toggle?.addEventListener('mousedown', (e) => e.preventDefault());
  toggle?.addEventListener('click', (e) => {
    e.preventDefault();
    if (listbox.hidden) {
      input.focus();
      open();
    } else {
      close();
      input.blur();
    }
  });

  return { openDropdown: open, closeDropdown: close };
}

/**
 * @param {HTMLElement} listbox
 * @param {Array<{ id: string, listing_fields?: Record<string, string>, body_html?: string, index_text?: string }>} entries
 * @param {string | null} selectedId
 * @param {(id: string, button: HTMLButtonElement) => void} onSelect
 * @param {(entry: { listing_fields?: Record<string, string>, body_html?: string }) => string} formatMeta
 */
export function renderPickerOptions(listbox, entries, selectedId, onSelect, formatMeta) {
  if (!entries.length) {
    showEmptyHint(listbox, 'No matching entries.');
    return;
  }

  listbox.innerHTML = entries
    .map((e) => {
      const name = e.listing_fields?.Name ?? e.id;
      const meta = formatMeta(e);
      const sel = e.id === selectedId;
      return `<button type="button" role="option" class="picker-option${sel ? ' picker-option--selected' : ''}" data-id="${esc(e.id)}" aria-selected="${sel ? 'true' : 'false'}">
          <span class="picker-option-name">${esc(name)}</span>
          <span class="picker-option-meta">${esc(meta)}</span>
        </button>`;
    })
    .join('');

  setListboxPanelClass(listbox, '');

  listbox.querySelectorAll('.picker-option').forEach((btn) => {
    btn.addEventListener('click', () => onSelect(btn.dataset.id, btn));
  });
}

export { showIdleHint, showEmptyHint };

/**
 * @param {HTMLInputElement} input
 * @param {import('../../data/compendium.js').CompendiumProvider} compendium
 * @param {string | null} entryId
 */
export async function setComboboxInputFromEntry(input, compendium, entryId) {
  if (!entryId || !input) return;
  const entry = await compendium.getEntry(entryId);
  if (entry) input.value = entry.listing_fields?.Name ?? entry.id;
}
