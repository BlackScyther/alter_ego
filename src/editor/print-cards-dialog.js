/**
 * Category-selection dialog for printable rule cards.
 *
 * Shown when the player clicks "Print cards" in the wizard. Lets them pick
 * which collection categories to print (Powers, Feats, Rituals). Universal
 * actions are intentionally excluded here - they live on the shared Resources
 * page. Resolves to the selected category keys, or null when cancelled. The
 * last selection is remembered for the session.
 */

const SELECTION_KEY = 'editor.printCards.categories';

/** Display label per category key. */
const CATEGORY_LABELS = {
  powers: 'Powers',
  feats: 'Feats',
  rituals: 'Rituals'
};

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
 * @param {string[]} categories
 */
function writeStoredSelection(categories) {
  try {
    sessionStorage.setItem(SELECTION_KEY, JSON.stringify(categories));
  } catch {
    /* ignore */
  }
}

/**
 * Open the print-cards category dialog.
 * @param {string[]} availableCategories - category keys present for this character
 * @returns {Promise<string[] | null>} selected keys, or null if cancelled
 */
export function openPrintCardsDialog(availableCategories) {
  const available = availableCategories.filter((c) => CATEGORY_LABELS[c]);
  if (!available.length) return Promise.resolve([]);

  const stored = readStoredSelection();
  const isChecked = (key) => (stored ? stored.includes(key) : true);

  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'print-cards-dialog';
    dialog.setAttribute('aria-label', 'Choose card categories to print');

    const rows = available
      .map(
        (key) => `
        <label class="print-cards-option">
          <input type="checkbox" value="${key}" ${isChecked(key) ? 'checked' : ''} />
          <span>${CATEGORY_LABELS[key]}</span>
        </label>`
      )
      .join('');

    dialog.innerHTML = `
      <form method="dialog" class="print-cards-form">
        <h2 class="print-cards-title">Print cards</h2>
        <p class="print-cards-hint">Choose which categories to include.</p>
        <div class="print-cards-options">${rows}</div>
        <div class="print-cards-actions">
          <button type="button" class="print-cards-cancel" value="cancel">Cancel</button>
          <button type="submit" class="print-cards-confirm" value="confirm">Open cards</button>
        </div>
      </form>`;

    let settled = false;
    const cleanup = (result) => {
      if (settled) return;
      settled = true;
      dialog.remove();
      resolve(result);
    };

    dialog.querySelector('.print-cards-cancel')?.addEventListener('click', () => {
      dialog.close('cancel');
    });

    dialog.querySelector('.print-cards-form')?.addEventListener('submit', () => {
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
