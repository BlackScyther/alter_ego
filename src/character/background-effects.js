/**
 * Background special effects — detect, validate, render, and apply composable benefits.
 */

import overrides from '../../data/background-effect-overrides.json' with { type: 'json' };
import { escapeHtml as esc } from '../shared/escape-html.js';
import { computeLevel1MaxHp, ensureDerivedBonuses } from './hp.js';

/** Abilities eligible to replace Constitution for starting HP (CON excluded). */
export const HP_SUBSTITUTE_ABILITIES = ['str', 'dex', 'int', 'wis', 'cha'];

const ABILITY_LABELS = {
  str: 'Strength',
  dex: 'Dexterity',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma'
};

const HP_CON_SUBSTITUTE_RE =
  /substitute[\s\S]*?(?:your\s+)?(?:highest\s+)?ability\s+score[\s\S]*?(?:for\s+)?Constitution[\s\S]*?(?:initial|starting)\s+hit\s+points/i;

const INITIATIVE_MISC_RE = /\+\s*(\d+)\s*bonus\s+(?:to\s+)?initiative(?:\s+checks)?/gi;

/** @typedef {{ type: string, sourceId?: string, mode?: string, amount?: number, skills?: unknown[] }} BackgroundEffect */

function stripHtml(html) {
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {object | null | undefined} entry
 */
function getOverrideEffects(entry) {
  if (!entry) return [];
  const byId = overrides[entry.id];
  if (Array.isArray(byId)) return byId.map((e) => ({ ...e }));
  const name = entry.listing_fields?.Name;
  const byName = name ? overrides[name] : null;
  if (Array.isArray(byName)) return byName.map((e) => ({ ...e }));
  return [];
}

/**
 * @param {string} text
 */
function detectInitiativeEffects(text, sourceId) {
  /** @type {BackgroundEffect[]} */
  const out = [];
  let m;
  const re = new RegExp(INITIATIVE_MISC_RE.source, 'gi');
  while ((m = re.exec(text)) !== null) {
    out.push({ type: 'initiative-misc', amount: Number(m[1]) || 0, sourceId });
  }
  return out;
}

/**
 * @param {object | null | undefined} entry
 * @param {ReturnType<import('./background-parse.js').parseBackgroundEntry>} parsed
 * @returns {BackgroundEffect[]}
 */
export function detectBackgroundEffects(entry, parsed) {
  if (!entry) return [];

  const sourceId = entry.id ?? '';
  const text = stripHtml(entry.body_html ?? '');
  /** @type {BackgroundEffect[]} */
  const effects = [];

  if (parsed.skillBonusKind === 'choice') {
    effects.push({ type: 'skill-bonus-choice', sourceId });
  } else if (parsed.skillBonusKind === 'fixed') {
    effects.push({ type: 'skill-bonus-fixed', sourceId, skills: parsed.fixedSkillBonuses });
  }

  if (HP_CON_SUBSTITUTE_RE.test(text)) {
    effects.push({ type: 'hp-con-substitute', mode: 'choose-one', sourceId });
  }

  for (const init of detectInitiativeEffects(text, sourceId)) {
    effects.push(init);
  }

  for (const override of getOverrideEffects(entry)) {
    if (override.type === 'initiative-misc') {
      if (!effects.some((e) => e.type === 'initiative-misc' && e.amount === override.amount)) {
        effects.push({ ...override, sourceId });
      }
      continue;
    }
    if (!effects.some((e) => e.type === override.type)) {
      effects.push({ ...override, sourceId });
    }
  }

  return effects;
}

/**
 * Remove benefit rows already represented as structured effects.
 * @param {Array<{ label: string, valueText: string }>} benefitRows
 * @param {BackgroundEffect[]} effects
 */
export function filterBenefitRowsForEffects(benefitRows, effects) {
  const hasHp = effects.some((e) => e.type === 'hp-con-substitute');
  const hasInit = effects.some((e) => e.type === 'initiative-misc');

  return benefitRows.filter((row) => {
    const t = row.valueText.toLowerCase();
    if (hasHp && HP_CON_SUBSTITUTE_RE.test(t)) return false;
    if (hasInit && /initiative/.test(t) && /\+\s*\d+/.test(t)) return false;
    return true;
  });
}

/**
 * @param {BackgroundEffect[]} effects
 * @param {{ hpSubstituteAbility?: string | null }} [choices]
 */
export function validateBackgroundEffects(effects, choices = {}) {
  const errors = [];
  if (effects.some((e) => e.type === 'hp-con-substitute') && !choices.hpSubstituteAbility) {
    errors.push('Choose which ability score replaces Constitution for starting hit points.');
  }
  return errors;
}

/**
 * @param {string} abilityKey
 */
export function formatHpSubstituteLabel(abilityKey) {
  return ABILITY_LABELS[abilityKey] ?? abilityKey.toUpperCase();
}

/**
 * @param {BackgroundEffect[]} effects
 * @param {{ hpSubstituteAbility?: string | null }} [choices]
 */
export function renderBackgroundEffectSections(effects, choices = {}) {
  const parts = [];
  const picked = choices.hpSubstituteAbility ?? null;

  if (effects.some((e) => e.type === 'hp-con-substitute')) {
    const buttons = HP_SUBSTITUTE_ABILITIES.map((ability) => {
      const selected = picked === ability;
      return `<button type="button" class="race-choice-btn background-hp-ability-btn${selected ? ' race-choice-btn--selected' : ''}" data-ability="${esc(ability)}" aria-pressed="${selected ? 'true' : 'false'}">${esc(formatHpSubstituteLabel(ability))}</button>`;
    }).join('');

    const status = picked
      ? `Selected: ${esc(formatHpSubstituteLabel(picked))} replaces Constitution for starting HP.`
      : 'Choose an ability score below.';

    parts.push(`<section class="background-effect-section background-hp-section">
      <h3 class="background-section-title">Starting Hit Points</h3>
      <p class="background-effect-note">Use your chosen ability score instead of Constitution for level-1 starting HP. Starting HP will be calculated after you choose class and ability scores.</p>
      <div class="race-inline-choices background-hp-choices" data-kind="hp-ability">${buttons}</div>
      <p class="background-hp-status">${status}</p>
    </section>`);
  }

  const initiativeTotal = effects
    .filter((e) => e.type === 'initiative-misc')
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  if (initiativeTotal > 0) {
    parts.push(`<section class="background-effect-section background-init-section">
      <h3 class="background-section-title">Initiative</h3>
      <p class="background-effect-readout">+${initiativeTotal} initiative (applied to sheet misc)</p>
    </section>`);
  }

  return parts.join('');
}

/**
 * @param {BackgroundEffect[]} effects
 * @param {{ hpSubstituteAbility?: string | null }} [choices]
 */
export function formatBackgroundEffectNotes(effects, choices = {}) {
  const lines = [];
  if (effects.some((e) => e.type === 'hp-con-substitute') && choices.hpSubstituteAbility) {
    lines.push(
      `Starting HP: use ${formatHpSubstituteLabel(choices.hpSubstituteAbility)} instead of Constitution`
    );
  }
  const initiativeTotal = effects
    .filter((e) => e.type === 'initiative-misc')
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  if (initiativeTotal > 0) {
    lines.push(`Initiative: +${initiativeTotal}`);
  }
  return lines;
}

/**
 * @param {object} character
 * @param {BackgroundEffect[]} effects
 * @param {{ classEntry?: object | null, scores?: Record<string, number> }} [context]
 */
export function applyBackgroundEffects(character, effects, context = {}) {
  ensureDerivedBonuses(character);

  const initiativeTotal = effects
    .filter((e) => e.type === 'initiative-misc')
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  character.sheet.derivedBonuses.initiative = initiativeTotal;

  const hpEffect = effects.find((e) => e.type === 'hp-con-substitute');
  const choices = character.selections?.backgroundEffectChoices ?? {};
  const scores = context.scores ?? character.abilities?.scores ?? {};

  if (hpEffect) {
    const ability = choices.hpSubstituteAbility ?? null;
    character.sheet.derivedBonuses.hpSubstituteAbility = ability;
    character.sheet.derivedBonuses.hpSubstituteScore = ability
      ? Number(scores[ability]) || 10
      : null;

    if (context.classEntry && Number(character.identity?.level) === 1) {
      const maxHp = computeLevel1MaxHp(character, context.classEntry);
      if (maxHp != null && !(Number(character.sheet.hp?.max) > 0)) {
        character.sheet.hp = character.sheet.hp ?? {};
        character.sheet.hp.max = maxHp;
        character.sheet.hp.current = maxHp;
      }
    }
  } else {
    character.sheet.derivedBonuses.hpSubstituteAbility = null;
    character.sheet.derivedBonuses.hpSubstituteScore = null;
  }

  return character;
}
