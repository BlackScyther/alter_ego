/**
 * Shared rule-card renderer for the cards page and the character sheet.
 * The sheet asks for powers only. The cards page passes the chosen categories.
 */

import { collectAllCollectionItems } from '../character/character-collection.js';
import { condenseRuleHtml } from '../ui/condense-rule-text.js';
import { escapeHtml } from '../shared/escape-html.js';
import {
  abilityKeyFromName,
  attackTotalFor,
  buildPowerCardContext,
  damageModFor,
  formatSigned
} from '../character/power-card-values.js';

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
 * @returns {string}
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
 * @param {HTMLElement} bodyEl
 * @param {import('../character/power-card-values.js').PowerCardContext} cardCtx
 */
function personalizePowerBody(bodyEl, cardCtx) {
  const text = (bodyEl.textContent ?? '').toLowerCase();
  const weapon = /\bweapon\b/.test(text);
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
 * @param {import('../data/compendium.js').CompendiumProvider} compendium
 */
async function renderTile(item, fallbackKind, cardCtx, compendium) {
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
 * @param {import('../data/compendium.js').CompendiumProvider} compendium
 */
async function renderSection(parent, title, items, fallbackKind, cardCtx, compendium) {
  const tiles = (
    await Promise.all(items.map((item) => renderTile(item, fallbackKind, cardCtx, compendium)))
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

/**
 * Fill `parent` with rule cards. Returns the number of cards rendered.
 * `categories` limits the set; null prints powers, feats, and rituals.
 * @param {HTMLElement} parent
 * @param {object} character
 * @param {import('../data/compendium.js').CompendiumProvider} compendium
 * @param {string[] | null} [categories]
 */
export async function renderRuleCards(parent, character, compendium, categories = null) {
  await compendium.ready();
  const wants = (key) => !categories || categories.includes(key);
  const { powers, feats, rituals } = await collectAllCollectionItems(character, compendium);
  const cardCtx = buildPowerCardContext(character);

  parent.replaceChildren();
  const container = document.createElement('div');
  container.className = 'cards-collection';
  if (wants('powers')) await renderSection(container, 'Powers', powers, 'Power', cardCtx, compendium);
  if (wants('feats')) await renderSection(container, 'Feats', feats, 'Feat', cardCtx, compendium);
  if (wants('rituals')) await renderSection(container, 'Rituals', rituals, 'Ritual', cardCtx, compendium);
  if (!container.childElementCount) return 0;
  parent.appendChild(container);
  return container.querySelectorAll('.rule-card').length;
}
