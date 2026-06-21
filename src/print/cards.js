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
import { collectAllCollectionItems } from '../character/character-collection.js';
import { condenseRuleHtml } from '../ui/condense-rule-text.js';
import { loadActiveCharacter } from '../character/store.js';
import { escapeHtml } from '../shared/escape-html.js';
import {
  abilityKeyFromName,
  attackTotalFor,
  buildPowerCardContext,
  damageModFor,
  formatSigned
} from '../character/power-card-values.js';

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

/**
 * @param {Record<string, string> | undefined} fields
 * @param {string} fallbackKind
 */
function metaLine(fields, fallbackKind) {
  const parts = [
    fields?.Type,
    fields?.Tier,
    fields?.Level ? `Level ${fields.Level}` : '',
    fields?.SourceBook
  ].filter(Boolean);
  return parts.join(' \u00b7 ') || fallbackKind;
}

/**
 * Map a power's usage type to a frequency accent class.
 * @param {string | undefined} type
 * @returns {string} '' when no frequency is detected.
 */
function frequencyClass(type) {
  const t = String(type ?? '').toLowerCase();
  if (t.includes('at-will') || t.includes('at will')) return 'rule-card--atwill';
  if (t.includes('encounter')) return 'rule-card--encounter';
  if (t.includes('daily')) return 'rule-card--daily';
  return '';
}

const ABILITY_RE = '(Strength|Constitution|Dexterity|Intelligence|Wisdom|Charisma)';
const ATTACK_ABILITY_RE = new RegExp(`\\b${ABILITY_RE}\\b(\\s*\\+\\s*(\\d+))?`, 'gi');
const DAMAGE_ABILITY_RE = new RegExp(`\\b${ABILITY_RE}\\s+modifier`, 'gi');

/** The leading bold label of a powerstat line, lowercased (e.g. "attack"). */
function powerstatLabel(p) {
  const bold = p.querySelector('b');
  return (bold?.textContent ?? p.textContent ?? '').trim().toLowerCase();
}

/**
 * Annotate a power's Attack and damage lines with this character's numbers.
 * Attack abilities gain the full to-hit (e.g. "Strength +9"); "<ability>
 * modifier" damage terms gain the modifier value (e.g. "Strength modifier (+5)").
 * @param {HTMLElement} bodyEl
 * @param {import('../character/power-card-values.js').PowerCardContext} cardCtx
 */
function personalizePowerBody(bodyEl, cardCtx) {
  const text = (bodyEl.textContent ?? '').toLowerCase();
  const weapon = /\bweapon\b/.test(text);
  // Implement powers (non-weapon) get the equipped implement's enhancement.
  const implement = !weapon && /\bimplement\b/.test(text);
  const ranged = /\branged\b/.test(text) || /\barea\b/.test(text);
  const sourceOpts = { weapon, implement, ranged };

  for (const p of bodyEl.querySelectorAll('p, li')) {
    const isAttack = powerstatLabel(p).startsWith('attack');
    const before = p.innerHTML;
    let after;
    if (isAttack) {
      after = before.replace(ATTACK_ABILITY_RE, (full, ability, _plus, inlineNum) => {
        const key = abilityKeyFromName(ability);
        if (!key) return full;
        const inline = inlineNum ? parseInt(inlineNum, 10) : 0;
        const total = attackTotalFor(cardCtx, key, { ...sourceOpts, inline });
        return `${ability} <span class="rule-card-calc">${formatSigned(total)}</span>`;
      });
    } else {
      after = before.replace(DAMAGE_ABILITY_RE, (full, ability) => {
        const key = abilityKeyFromName(ability);
        if (!key) return full;
        const val = damageModFor(cardCtx, key, sourceOpts);
        return `${full} <span class="rule-card-calc">(${formatSigned(val)})</span>`;
      });
    }
    if (after !== before) p.innerHTML = after;
  }
}

/**
 * @param {object} item
 * @param {string} fallbackKind
 * @param {import('../character/power-card-values.js').PowerCardContext} cardCtx
 */
async function renderTile(item, fallbackKind, cardCtx) {
  if (item.empty) return null;
  const entry = await compendium.getEntry(item.id);
  const fields = entry?.listing_fields ?? {};
  const name = fields.Name ?? item.name ?? item.id;
  const body = condenseRuleHtml(entry);

  const tile = document.createElement('article');
  tile.className = `rule-card rule-card--${item.category}`;
  const freq = frequencyClass(fields.Type);
  if (freq) tile.classList.add(freq);
  tile.innerHTML = `
    <header class="rule-card-head">
      <h3 class="rule-card-name">${escapeHtml(name)}</h3>
      <p class="rule-card-meta">${escapeHtml(metaLine(fields, fallbackKind))}</p>
    </header>
    <div class="rule-card-body entry-preview">${body || '<p class="rule-card-empty">No rule text available.</p>'}</div>`;

  if (item.category === 'power' && cardCtx) {
    const bodyEl = tile.querySelector('.rule-card-body');
    if (bodyEl) personalizePowerBody(bodyEl, cardCtx);
  }
  return tile;
}

/**
 * @param {HTMLElement} parent
 * @param {string} title
 * @param {object[]} items
 * @param {string} fallbackKind
 * @param {import('../character/power-card-values.js').PowerCardContext} cardCtx
 */
async function renderSection(parent, title, items, fallbackKind, cardCtx) {
  const tiles = (
    await Promise.all(items.map((item) => renderTile(item, fallbackKind, cardCtx)))
  ).filter(Boolean);
  if (!tiles.length) return;

  const section = document.createElement('section');
  section.className = 'rule-card-section';
  const heading = document.createElement('h2');
  heading.className = 'rule-card-section-title';
  heading.textContent = title;
  section.appendChild(heading);

  const grid = document.createElement('div');
  grid.className = 'rule-card-grid';
  for (const tile of tiles) grid.appendChild(tile);
  section.appendChild(grid);
  parent.appendChild(section);
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
  const wants = (key) => !categories || categories.includes(key);

  const name = character.identity?.name?.trim() || 'Unnamed character';
  const level = character.identity?.level ?? 1;
  const heading = `Rule cards \u2014 ${name} (Level ${level})`;
  titleEl.textContent = heading;
  document.title = heading;

  await compendium.ready();
  // Universal actions are intentionally not printed here; they live on the
  // shared Resources page. Only the character's own collection is printed.
  const { powers, feats, rituals } = await collectAllCollectionItems(character, compendium);

  const cardCtx = buildPowerCardContext(character);

  const container = document.createElement('div');
  container.className = 'cards-collection';
  if (wants('powers')) await renderSection(container, 'Powers', powers, 'Power', cardCtx);
  if (wants('feats')) await renderSection(container, 'Feats', feats, 'Feat', cardCtx);
  if (wants('rituals')) await renderSection(container, 'Rituals', rituals, 'Ritual', cardCtx);

  if (!container.childElementCount) {
    gridEl.className = 'cards-status';
    gridEl.textContent = 'No cards to print for the selected categories.';
    return;
  }

  gridEl.replaceWith(container);
}

main().catch((err) => {
  gridEl.className = 'cards-status cards-status--error';
  gridEl.textContent = err?.message ?? String(err);
});
