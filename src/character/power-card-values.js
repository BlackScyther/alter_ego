/**
 * Per-character attack/damage math for printable power cards.
 *
 * Powers state their attack as e.g. "Strength vs. AC" and damage as
 * "2[W] + Strength modifier". This module turns the named ability into the
 * actual numbers this character adds at the table, reusing the same formulas
 * the sheet uses so the cards stay consistent with it.
 *
 * Attack to-hit (4e): half level + ability modifier + weapon proficiency +
 * enhancement + feat/misc. We include half level, the ability modifier, the
 * equipped weapon's proficiency bonus, and the magic enhancement of the
 * relevant equipped item (weapon powers use the weapon's bonus, implement
 * powers use the implement's bonus). Feat/misc bonuses are not modeled yet.
 *
 * Damage bonus: ability modifier + the same enhancement bonus (no half level).
 * Feat bonuses are not modeled.
 */

import { abilityModifier, halfLevel } from '../formulas.js';
import { getFinalScores } from './tutor.js';

/** Power-text ability names -> character ability keys. */
const ABILITY_NAME_TO_KEY = {
  strength: 'str',
  constitution: 'con',
  dexterity: 'dex',
  intelligence: 'int',
  wisdom: 'wis',
  charisma: 'cha'
};

/**
 * @param {string} name
 * @returns {string | null}
 */
export function abilityKeyFromName(name) {
  return ABILITY_NAME_TO_KEY[String(name ?? '').toLowerCase()] ?? null;
}

/** @param {number} n */
export function formatSigned(n) {
  const v = Math.trunc(Number(n) || 0);
  return v >= 0 ? `+${v}` : `${v}`;
}

/**
 * @typedef {object} PowerCardContext
 * @property {number} half - half level
 * @property {Record<string, number>} mods - ability modifiers by key
 * @property {number} meleeProf - equipped melee weapon proficiency bonus
 * @property {number} rangedProf - equipped ranged weapon proficiency bonus
 * @property {number} meleeEnh - equipped melee weapon enhancement bonus
 * @property {number} rangedEnh - equipped ranged weapon enhancement bonus
 * @property {number} implementEnh - equipped implement enhancement bonus
 */

/**
 * Build the reusable math context for a character.
 * @param {object} character
 * @returns {PowerCardContext}
 */
export function buildPowerCardContext(character) {
  const scores = getFinalScores(character) ?? {};
  const level = character?.identity?.level ?? 1;
  const extra = character?.sheet?.extraFields ?? {};
  /** @type {Record<string, number>} */
  const mods = {};
  for (const key of Object.values(ABILITY_NAME_TO_KEY)) {
    mods[key] = abilityModifier(scores[key] ?? 10);
  }
  return {
    half: halfLevel(level),
    mods,
    meleeProf: Number(extra['melee-atk-prof']) || 0,
    rangedProf: Number(extra['ranged-atk-prof']) || 0,
    meleeEnh: Number(extra['weapon-melee-enh']) || 0,
    rangedEnh: Number(extra['weapon-ranged-enh']) || 0,
    implementEnh: Number(extra['implement-enh']) || 0
  };
}

/**
 * Enhancement bonus for the relevant equipped item: weapon powers use the
 * weapon's bonus (per melee/ranged line), implement powers use the implement's.
 * @param {PowerCardContext} ctx
 * @param {{ weapon?: boolean, ranged?: boolean, implement?: boolean }} opts
 * @returns {number}
 */
function enhancementFor(ctx, opts) {
  if (opts.weapon) return opts.ranged ? (ctx?.rangedEnh ?? 0) : (ctx?.meleeEnh ?? 0);
  if (opts.implement) return ctx?.implementEnh ?? 0;
  return 0;
}

/**
 * Full attack to-hit for a named ability on this character.
 * @param {PowerCardContext} ctx
 * @param {string} abilityKey
 * @param {{ weapon?: boolean, ranged?: boolean, implement?: boolean, inline?: number }} [opts]
 * @returns {number}
 */
export function attackTotalFor(ctx, abilityKey, opts = {}) {
  const mod = ctx?.mods?.[abilityKey] ?? 0;
  const prof = opts.weapon ? (opts.ranged ? ctx.rangedProf : ctx.meleeProf) : 0;
  const enh = enhancementFor(ctx, opts);
  const inline = Number(opts.inline) || 0;
  return (ctx?.half ?? 0) + mod + prof + enh + inline;
}

/**
 * Damage bonus (ability modifier + relevant enhancement) for a named ability.
 * @param {PowerCardContext} ctx
 * @param {string} abilityKey
 * @param {{ weapon?: boolean, ranged?: boolean, implement?: boolean }} [opts]
 * @returns {number}
 */
export function damageModFor(ctx, abilityKey, opts = {}) {
  const mod = ctx?.mods?.[abilityKey] ?? 0;
  return mod + enhancementFor(ctx, opts);
}
