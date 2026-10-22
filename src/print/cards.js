/**
 * Printable rule cards for a character's collection.
 *
 * Renders one condensed tile per power, feat, and ritual the character has
 * (universal actions are excluded - they live on the shared Resources page).
 * The working character is handed off from the editor through a
 * temporary localStorage key; if that is absent we fall back to the active
 * stored character so the page also works when opened directly.
 */

import { compendium } from '../data/compendium.js';
import { loadActiveCharacter } from '../character/store.js';
import { renderRuleCards } from './rule-cards.js';

const HANDOFF_KEY = 'editor.printCards';

const titleEl = document.getElementById('cards-title');
const gridEl = document.getElementById('cards-grid');

document.getElementById('cards-print')?.addEventListener('click', () => window.print());
document.getElementById('cards-close')?.addEventListener('click', () => window.close());

/**
 * Read the editor handoff: `{ character, categories }`. Returns an empty object
 * when absent so callers can fall back to the active stored character.
 * @returns {{ character?: object, categories?: string[] }}
 */
function readHandoff() {
  let raw = null;
  try {
    raw = localStorage.getItem(HANDOFF_KEY);
    if (raw) localStorage.removeItem(HANDOFF_KEY);
  } catch {
    raw = null;
  }
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function main() {
  const handoff = readHandoff();
  const character = handoff.character ?? loadActiveCharacter();
  if (!character) {
    gridEl.className = 'cards-status';
    gridEl.textContent = 'No character found. Open the generator and use "Print cards" there.';
    return;
  }

  const categories = Array.isArray(handoff.categories) ? handoff.categories : null;

  const name = character.identity?.name?.trim() || character.identity?.characterName?.trim() || 'Unnamed character';
  const level = character.identity?.level ?? 1;
  const heading = `Rule cards \u2014 ${name} (Level ${level})`;
  titleEl.textContent = heading;
  document.title = heading;

  const count = await renderRuleCards(gridEl, character, compendium, categories);
  if (!count) {
    gridEl.className = 'cards-status';
    gridEl.textContent = 'No cards to print for the selected categories.';
  }
}

main().catch((err) => {
  gridEl.className = 'cards-status cards-status--error';
  gridEl.textContent = err?.message ?? String(err);
});
