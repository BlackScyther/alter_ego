/**
 * Class feature special effects — detect and apply static, sheet-relevant
 * benefits granted by class features.
 *
 * Granted class-feature blocks are the source of flat initiative and skill
 * bonuses. Sentences with if/when/whenever/unless are skipped. The curated
 * override file applies only when a class entry has no feature section.
 */

import overrides from '../../data/class-effect-overrides.json' with { type: 'json' };
import { SKILLS } from '../formulas.js';
import { ensureDerivedBonuses, recomposeDerivedInitiative } from './hp.js';
import {
  grantedClassFeatures,
  resolveBuildClassFeatureNames,
  parseClassEntry
} from './class-parse.js';

/** Flat initiative bonus, e.g. "you gain a +1 bonus to initiative checks". */
const INITIATIVE_MISC_RE = /\+\s*(\d+)\s*bonus\s+(?:to\s+)?initiative(?:\s+checks)?/gi;

/**
 * Flat bonus that may name a 4e type: "+2 power bonus to initiative",
 * "+4 feat bonus to initiative", "+2 bonus to Insight checks".
 */
const TYPED_INITIATIVE_RE =
  /\+\s*(\d+)\s+(?:(power|feat|item|untyped)\s+)?bonus\s+to\s+initiative(?:\s+checks)?/gi;

/** Skip conditional sentences. Flat bonuses in other sentences still count. */
const SENTENCE_CONDITIONAL_RE = /\b(if|when|whenever|unless)\b/i;

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
 * @param {string} bonusType
 */
function normalizeFeatureBonusType(bonusType, untypedType = 'class') {
  const t = String(bonusType ?? '').toLowerCase();
  if (t === 'power' || t === 'feat' || t === 'item') return t;
  if (t === 'untyped') return 'other';
  return untypedType;
}

/**
 * Flat initiative and skill bonuses in unconditional sentences.
 * Sentences with if, when, whenever, or unless are skipped.
 * @param {string} text
 * @param {string} sourceId
 * @param {string} [feature]
 * @param {string} [untypedType] bonus type when the sentence names no type
 * @returns {ClassEffect[]}
 */
export function detectStaticFeatureBonuses(text, sourceId, feature, untypedType = 'class') {
  /** @type {ClassEffect[]} */
  const out = [];
  const sentences = String(text ?? '').split(/(?<=[.!?])\s+/);
  for (const sentence of sentences) {
    if (SENTENCE_CONDITIONAL_RE.test(sentence)) continue;

    const initRe = new RegExp(TYPED_INITIATIVE_RE.source, 'gi');
    let m;
    while ((m = initRe.exec(sentence)) !== null) {
      out.push({
        type: 'initiative-misc',
        amount: Number(m[1]) || 0,
        bonusType: normalizeFeatureBonusType(m[2], untypedType),
        feature,
        sourceId
      });
    }

    const lower = sentence.toLowerCase();
    if (!/\+\s*\d+\s+(?:(?:power|feat|item|untyped)\s+)?bonus\s+to\b/i.test(sentence)) continue;
    if (!/\bchecks\b/i.test(sentence)) continue;
    const amountMatch = sentence.match(
      /\+\s*(\d+)\s+(?:(power|feat|item|untyped)\s+)?bonus\s+to\b/i
    );
    if (!amountMatch) continue;
    const amount = Number(amountMatch[1]) || 0;
    const bonusType = normalizeFeatureBonusType(amountMatch[2], untypedType);
    for (const skill of SKILLS) {
      if (!lower.includes(skill.name.toLowerCase())) continue;
      out.push({
        type: 'skill-bonus',
        skill: skill.id,
        amount,
        bonusType,
        feature,
        sourceId,
        note: `+${amount} ${skill.name}`
      });
    }
  }
  return out;
}

/**
 * @param {object | null | undefined} classEntry
 * @param {{ buildLabel?: string | null }} [opts]
 * @returns {ClassEffect[]}
 */
export function detectClassEffects(classEntry, opts = {}) {
  if (!classEntry) return [];

  const sourceId = classEntry.id ?? '';
  const parsed = parseClassEntry(classEntry);
  const features = parsed.features ?? [];

  // Feature blocks are authoritative. The curated override applies only when
  // the class HTML has no feature section, so a replacement build is not
  // given Combat Leader on top of the feature that replaced it.
  if (features.length) {
    const names = resolveBuildClassFeatureNames(
      classEntry.body_html ?? '',
      opts.buildLabel,
      features
    );
    const granted = grantedClassFeatures(features, names);
    /** @type {ClassEffect[]} */
    const effects = [];
    for (const feature of granted) {
      effects.push(...detectStaticFeatureBonuses(feature.text, sourceId, feature.name));
    }
    return effects;
  }

  /** @type {ClassEffect[]} */
  const effects = [];
  const overrideEffects = getOverrideEffects(classEntry);
  const hasOverrideInit = overrideEffects.some((e) => e.type === 'initiative-misc');
  for (const override of overrideEffects) {
    effects.push({ ...override, sourceId });
  }

  if (!hasOverrideInit) {
    const text = stripHtml(classEntry.body_html ?? '');
    for (const init of detectInitiativeEffects(text, sourceId)) {
      effects.push(init);
    }
  }

  return effects;
}

/**
 * @param {object} character
 * @param {object | null | undefined} classEntry
 */
export function detectClassEffectsForCharacter(character, classEntry) {
  const parsed = parseClassEntry(classEntry);
  const buildId = character?.selections?.classBuildChoices?.build ?? null;
  const buildLabel = parsed.buildOptions.find((opt) => opt.id === buildId)?.label ?? null;
  return detectClassEffects(classEntry, { buildLabel });
}

/**
 * Skill rows for the tutor bonus list, from granted class features.
 * @param {object} character
 * @param {object | null | undefined} classEntry
 */
export function classFeatureSkillBonusRows(character, classEntry) {
  return detectClassEffectsForCharacter(character, classEntry)
    .filter((e) => e.type === 'skill-bonus')
    .map((e) => ({
      source: 'class',
      sourceId: classEntry?.id ?? null,
      sourceName: e.feature || classEntry?.listing_fields?.Name || 'Class',
      skill: e.skill,
      amount: e.amount,
      bonusType: e.bonusType || 'class',
      choiceGroup: null,
      note: e.note || ''
    }));
}

/**
 * Sum of flat feat bonuses to initiative, such as Improved Initiative +4.
 * @param {Array<{ body_html?: string }> | null | undefined} featEntries
 */
export function featInitiativeTotal(featEntries) {
  return (featEntries ?? []).reduce(
    (sum, entry) => sum + flatInitiativeInHtml(entry?.body_html),
    0
  );
}

/**
 * @param {string | null | undefined} html
 */
export function flatInitiativeInHtml(html) {
  const text = stripHtml(html);
  let total = 0;
  for (const sentence of String(text).split(/(?<=[.!?])\s+/)) {
    if (SENTENCE_CONDITIONAL_RE.test(sentence)) continue;
    const re = new RegExp(TYPED_INITIATIVE_RE.source, 'gi');
    let m;
    while ((m = re.exec(sentence)) !== null) {
      total += Number(m[1]) || 0;
    }
  }
  return total;
}

/**
 * @param {object} character
 * @param {number} total
 */
export function applyFeatInitiative(character, total) {
  ensureDerivedBonuses(character);
  const amount = Number(total) || 0;
  character.sheet.derivedBonuses.initiativeFeat = amount;
  // A Misc value that is exactly this feat bonus was typed in place of it.
  if (amount > 0 && Number(character.sheet.initMisc) === amount) {
    character.sheet.initMisc = 0;
  }
  recomposeDerivedInitiative(character);
  return character;
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
  character.sheet.derivedBonuses.initiativeClass = classInitiativeTotal(effects);
  recomposeDerivedInitiative(character);
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
    if (e.type === 'initiative-misc') {
      const amount = Number(e.amount) || 0;
      if (amount <= 0) continue;
      const label = e.feature ? ` (${e.feature})` : '';
      lines.push(`Initiative: +${amount}${label}`);
      continue;
    }
    if (e.type === 'skill-bonus') {
      const amount = Number(e.amount) || 0;
      if (amount <= 0 || !e.skill) continue;
      const skill = SKILLS.find((s) => s.id === e.skill);
      const label = e.feature ? ` (${e.feature})` : '';
      lines.push(`${skill?.name ?? e.skill}: +${amount}${label}`);
    }
  }
  return lines;
}
