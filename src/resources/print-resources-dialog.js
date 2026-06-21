/**
 * Section-selection dialog for the printable player resources page.
 *
 * Shown when the player clicks "Print" on the Resources page. Lets them pick
 * which reference sections to print. Resolves to the selected section keys, or
 * null when cancelled. The last selection is remembered for the session.
 */

const SELECTION_KEY = 'resources.print.sections';

/** Display label per section key (order = print order). */
const SECTION_LABELS = {
  levels: 'Level 1–30 values',
  formulas: 'Formula key',
  universal: 'Universal actions'
};

const SECTION_KEYS = Object.keys(SECTION_LABELS);

/**
 * @returns {string[] | null}
 */
function readStoredSelection() {
  try {
    const raw = sessionStorage.getItem(SELECTION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * @param {string[]} sections
 */
function writeStoredSelection(sections) {
  try {
    sessionStorage.setItem(SELECTION_KEY, JSON.stringify(sections));
  } catch {
    /* ignore */
  }
}

/**
 * Open the print-sections dialog.
 * @returns {Promise<string[] | null>} selected section keys, or null if cancelled
 */
export function openPrintResourcesDialog() {
  const stored = readStoredSelection();
  const isChecked = (key) => (stored ? stored.includes(key) : true);

  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'print-resources-dialog';
    dialog.setAttribute('aria-label', 'Choose resource sections to print');

    const rows = SECTION_KEYS.map(
      (key) => `
        <label class="print-resources-option">
          <input type="checkbox" value="${key}" ${isChecked(key) ? 'checked' : ''} />
          <span>${SECTION_LABELS[key]}</span>
        </label>`
    ).join('');

    dialog.innerHTML = `
      <form method="dialog" class="print-resources-form">
        <h2 class="print-resources-title">Print resources</h2>
        <p class="print-resources-hint">Choose which sections to include.</p>
        <div class="print-resources-options">${rows}</div>
        <div class="print-resources-actions">
          <button type="button" class="print-resources-cancel" value="cancel">Cancel</button>
          <button type="submit" class="print-resources-confirm" value="confirm">Print</button>
        </div>
      </form>`;

    let settled = false;
    const cleanup = (result) => {
      if (settled) return;
      settled = true;
      dialog.remove();
      resolve(result);
    };

    dialog.querySelector('.print-resources-cancel')?.addEventListener('click', () => {
      dialog.close('cancel');
    });

    dialog.querySelector('.print-resources-form')?.addEventListener('submit', () => {
      const selected = Array.from(
        dialog.querySelectorAll('input[type="checkbox"]:checked')
      ).map((el) => el.value);
      writeStoredSelection(selected);
      cleanup(selected);
    });

    // Esc / Cancel resolves null unless a submit already settled the selection.
    dialog.addEventListener('close', () => cleanup(null));

    document.body.appendChild(dialog);
    dialog.showModal();
    dialog.querySelector('input[type="checkbox"]')?.focus();
  });
}
