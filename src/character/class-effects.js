/**
 * Class feature special effects — detect and apply static, sheet-relevant
 * benefits granted by class features.
 *
 * Class features are stored as raw HTML and are not modeled structurally, so
 * the authoritative source is the curated override file
 * `data/class-effect-overrides.json` (keyed by class id or class name). A
 * conservative text fallback only captures flat "+N bonus to initiative"
 * phrasing and deliberately skips conditional modifiers (e.g. "if your
 * initiative is higher", "roll twice"), which players resolve manually.
 */

import overrides from '../../data/class-effect-overrides.json' with { type: 'json' };
import { ensureDerivedBonuses } from './hp.js';

/** Flat initiative bonus, e.g. "you gain a +1 bonus to initiative checks". */
const INITIATIVE_MISC_RE = /\+\s*(\d+)\s*bonus\s+(?:to\s+)?initiative(?:\s+checks)?/gi;

/**
 * Phrases that mark a conditional initiative effect (intentionally ignored).
 * These depend on circumstance or the rolled value, not a flat bonus.
 */
const CONDITIONAL_INITIATIVE_RE =
  /\b(if|when|unless|higher|lower|instead of|reroll|twice|whenever)\b/i;

/** @typedef {{ type: string, sourceId?: string, amount?: number, feature?: string }} ClassEffect */

function stripHtml(html) {
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {object | null | undefined} entry
 * @returns {ClassEffect[]}
 */
function getOverrideEffects(entry) {
  if (!entry) return [];
  const byId = entry.id ? overrides[entry.id] : null;
  if (Array.isArray(byId)) return byId.map((e) => ({ ...e }));
  const name = entry.listing_fields?.Name;
  const byName = name ? overrides[name] : null;
  if (Array.isArray(byName)) return byName.map((e) => ({ ...e }));
  return [];
}

/**
 * Conservative text scan for flat initiative bonuses. Sentences that contain
 * conditional phrasing are skipped so only static bonuses are captured.
 *
 * @param {string} text
 * @param {string} sourceId
 * @returns {ClassEffect[]}
 */
function detectInitiativeEffects(text, sourceId) {
  /** @type {ClassEffect[]} */
  const out = [];
  const sentences = String(text ?? '').split(/(?<=[.!?])\s+/);
  for (const sentence of sentences) {
    if (CONDITIONAL_INITIATIVE_RE.test(sentence)) continue;
    let m;
    const re = new RegExp(INITIATIVE_MISC_RE.source, 'gi');
    while ((m = re.exec(sentence)) !== null) {
      out.push({ type: 'initiative-misc', amount: Number(m[1]) || 0, sourceId });
    }
  }
  return out;
}

/**
 * @param {object | null | undefined} classEntry
 * @returns {ClassEffect[]}
 */
export function detectClassEffects(classEntry) {
  if (!classEntry) return [];

  const sourceId = classEntry.id ?? '';
  /** @type {ClassEffect[]} */
  const effects = [];

  const overrideEffects = getOverrideEffects(classEntry);
  const hasOverrideInit = overrideEffects.some((e) => e.type === 'initiative-misc');
  for (const override of overrideEffects) {
    effects.push({ ...override, sourceId });
  }

  // The curated override is authoritative for initiative; only fall back to the
  // text scan when no initiative override exists for this class.
  if (!hasOverrideInit) {
    const text = stripHtml(classEntry.body_html ?? '');
    for (const init of detectInitiativeEffects(text, sourceId)) {
      effects.push(init);
    }
  }

  return effects;
}

/**
 * Sum of all flat initiative bonuses from class effects.
 * @param {ClassEffect[]} effects
 */
export function classInitiativeTotal(effects) {
  return (effects ?? [])
    .filter((e) => e.type === 'initiative-misc')
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
}

/**
 * Write the class initiative contribution onto the sheet and recompose the
 * total derived initiative (class + background).
 *
 * @param {object} character
 * @param {ClassEffect[]} effects
 */
export function applyClassEffects(character, effects) {
  ensureDerivedBonuses(character);
  const derived = character.sheet.derivedBonuses;
  derived.initiativeClass = classInitiativeTotal(effects);
  derived.initiative =
    (Number(derived.initiativeBackground) || 0) + (Number(derived.initiativeClass) || 0);
  return character;
}

/**
 * Human-readable note lines for the character sheet/notes.
 * @param {ClassEffect[]} effects
 * @returns {string[]}
 */
export function formatClassEffectNotes(effects) {
  const lines = [];
  for (const e of effects ?? []) {
    if (e.type !== 'initiative-misc') continue;
    const amount = Number(e.amount) || 0;
    if (amount <= 0) continue;
    const label = e.feature ? ` (${e.feature})` : '';
    lines.push(`Initiative: +${amount}${label}`);
  }
  return lines;
}
