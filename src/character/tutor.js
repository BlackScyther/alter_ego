/**
 * Character tutor — ability & skill bonuses, choice groups, and 4e-type stacking.
 */

import { SKILLS } from '../formulas.js';
import {
  BONUS_TYPE_LABELS,
  normalizeBonusType,
  stackBonusesOnTarget
} from './bonus-stacking.js';

export const ABILITY_KEYS = ['str', 'con', 'dex', 'int', 'wis', 'cha'];
export const SKILL_IDS = SKILLS.map((s) => s.id);

export { BONUS_TYPE_LABELS };

export const TUTOR_GUIDE = {
  abilityBonuses: {
    title: 'Ability bonuses at creation',
    body: [
      'Point-buy sets base scores (7–18). Bonuses add on top for the end result on the character sheet.',
      'Bonuses of the same type on one ability do not stack — only the highest counts (two Feat bonuses, two Skill bonuses, etc.).',
      'Different types on the same ability do add (e.g. Racial + Feat). “Or” choices in one group still replace each other.',
      'The end result is base + one bonus per type; that total is held firm when you save.'
    ].join(' ')
  },
  skillBonuses: {
    title: 'Skill bonuses',
    body: [
      'Backgrounds and feats often grant skill bonuses. Two Skill-type bonuses to the same skill do not add — use the highest.',
      'A Skill bonus and a Feat bonus to the same skill do add. Applied totals are shown below for sheet Misc when you open the sheet.'
    ].join(' ')
  },
  itemBonuses: {
    title: 'Item & enhancement bonuses',
    body: [
      'On the sheet, Enhancement and Item bonuses to the same defense or roll do not stack — use the highest.',
      'Some features exclude item bonuses; note those in Misc on the sheet.'
    ].join(' ')
  },
  pointBuy: {
    title: 'Point-buy (22 points)',
    body:
      'Base scores 8–18; only one ability may be below 10. Costs match Orokos: +1 per point from 11–13, then +2 steps at 14–16 and +3 at 17–18; lowering below 10 refunds points (8 = −2, 9 = −1). All 10s total 2; maximum spend is 22.'
  }
};

function stripHtml(html) {
  if (typeof document !== 'undefined') {
    const d = document.createElement('div');
    d.innerHTML = html ?? '';
    return d.textContent.trim();
  }
  return String(html ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeAbility(key) {
  if (!key) return 'any';
  const k = String(key).toLowerCase();
  const map = {
    strength: 'str',
    str: 'str',
    constitution: 'con',
    con: 'con',
    dexterity: 'dex',
    dex: 'dex',
    intelligence: 'int',
    int: 'int',
    wisdom: 'wis',
    wis: 'wis',
    charisma: 'cha',
    cha: 'cha',
    any: 'any',
    choice: 'any'
  };
  return map[k] ?? k;
}

function normalizeSkillId(key) {
  const k = String(key ?? '').toLowerCase();
  if (SKILL_IDS.includes(k)) return k;
  const byName = SKILLS.find((s) => s.name.toLowerCase() === k);
  return byName?.id ?? k;
}

function defaultBonusTypeForSource(source, raw = {}) {
  if (raw.bonusType) return normalizeBonusType(raw.bonusType, source);
  if (raw.kind === 'skill' || source === 'background') return 'skill';
  if (source === 'feat') return 'feat';
  if (source === 'race') return 'race';
  if (source === 'class') return 'class';
  if (source === 'theme') return 'theme';
  return 'other';
}

function resolveAbilityTarget(bonus, anyChoice) {
  let target = bonus.ability;
  if (target === 'any') {
    target = anyChoice?.[bonus.id];
    if (!target) return null;
  }
  return ABILITY_KEYS.includes(target) ? target : null;
}

function resolveBonusRows(bonuses, anyChoice) {
  return (bonuses ?? [])
    .filter((b) => b.enabled)
    .map((b) => {
      const target = b.skill ? normalizeSkillId(b.skill) : resolveAbilityTarget(b, anyChoice);
      if (!target) return null;
      return {
        ...b,
        bonusType: normalizeBonusType(b.bonusType, b.source),
        _target: target
      };
    })
    .filter(Boolean);
}

export function bonusesFromEntry(entry, source) {
  if (!entry) return { ability: [], skill: [] };
  const ability = [];
  const skill = [];

  if (Array.isArray(entry.ability_bonuses)) {
    for (const b of entry.ability_bonuses) {
      ability.push(rawAbilityRow(b, source, entry));
    }
  } else {
    ability.push(...parseAbilityBonusesFromHtml(entry.body_html, source, entry));
  }

  if (Array.isArray(entry.skill_bonuses)) {
    for (const b of entry.skill_bonuses) {
      skill.push(rawSkillRow(b, source, entry));
    }
  } else {
    skill.push(...parseSkillBonusesFromHtml(entry.body_html, source, entry));
  }

  return { ability, skill };
}

function rawAbilityRow(b, source, entry) {
  return {
    source,
    sourceId: entry.id,
    sourceName: entry.listing_fields?.Name ?? entry.id,
    ability: normalizeAbility(b.ability),
    amount: Number(b.amount) || 0,
    bonusType: defaultBonusTypeForSource(source, b),
    choiceGroup: b.choiceGroup ?? null,
    alternatives: (b.alternatives ?? []).map(normalizeAbility),
    excludesItemBonus: Boolean(b.excludesItemBonus),
    note: b.note ?? ''
  };
}

function rawSkillRow(b, source, entry) {
  return {
    source,
    sourceId: entry.id,
    sourceName: entry.listing_fields?.Name ?? entry.id,
    skill: normalizeSkillId(b.skill),
    amount: Number(b.amount) || 0,
    bonusType: defaultBonusTypeForSource(source, { ...b, kind: 'skill' }),
    choiceGroup: b.choiceGroup ?? null,
    note: b.note ?? ''
  };
}

const ABILITY_NAME_RE =
  '(Strength|Constitution|Dexterity|Intelligence|Wisdom|Charisma|STR|CON|DEX|INT|WIS|CHA)';

function abilityBonusRow(source, entry, name, ability, amount, choiceGroup, note) {
  return {
    source,
    sourceId: entry?.id ?? null,
    sourceName: name,
    ability: normalizeAbility(ability),
    amount,
    bonusType: defaultBonusTypeForSource(source),
    choiceGroup,
    alternatives: [],
    excludesItemBonus: false,
    note: note ?? `+${amount} ${ability}`
  };
}

function extractAbilityBonusBlock(text) {
  const match = text.match(/ability\s+(?:bonus(?:es)?|scores):?\s*([^.]+)/i);
  return match?.[1]?.trim() ?? '';
}

export function parseAbilityBonusesFromHtml(html, source, entry) {
  const text = stripHtml(html);
  if (!text) return [];
  const name = entry?.listing_fields?.Name ?? entry?.id ?? source;
  const block = extractAbilityBonusBlock(text);
  if (!block) return [];

  if (/one ability score of your choice/i.test(block)) {
    return [
      abilityBonusRow(source, entry, name, 'any', 2, `${entry?.id ?? source}-any-one`, block.slice(0, 120))
    ];
  }

  const group = `${entry?.id ?? source}-or`;

  // +2 Constitution, +2 Strength or +2 Wisdom
  const fullOr = new RegExp(
    `\\+\\s*(\\d+)\\s*${ABILITY_NAME_RE}\\s*,\\s*\\+\\s*(\\d+)\\s*${ABILITY_NAME_RE}\\s+or\\s+\\+\\s*(\\d+)\\s*${ABILITY_NAME_RE}`,
    'i'
  ).exec(block);
  if (fullOr) {
    const [, fixedAmt, fixedAb, optAmt1, optAb1, optAmt2, optAb2] = fullOr;
    return [
      abilityBonusRow(source, entry, name, fixedAb, Number(fixedAmt), null, block.slice(0, 120)),
      abilityBonusRow(source, entry, name, optAb1, Number(optAmt1), group, block.slice(0, 120)),
      abilityBonusRow(source, entry, name, optAb2, Number(optAmt2), group, block.slice(0, 120))
    ];
  }

  // +2 Constitution, +2 Wisdom or Strength
  const shortOr = new RegExp(
    `\\+\\s*(\\d+)\\s*${ABILITY_NAME_RE}\\s*,\\s*\\+\\s*(\\d+)\\s*${ABILITY_NAME_RE}\\s+or\\s+${ABILITY_NAME_RE}`,
    'i'
  ).exec(block);
  if (shortOr) {
    const [, fixedAmt, fixedAb, optAmt, optAb1, optAb2] = shortOr;
    const amount = Number(optAmt);
    return [
      abilityBonusRow(source, entry, name, fixedAb, Number(fixedAmt), null, block.slice(0, 120)),
      abilityBonusRow(source, entry, name, optAb1, amount, group, block.slice(0, 120)),
      abilityBonusRow(source, entry, name, optAb2, amount, group, block.slice(0, 120))
    ];
  }

  const out = [];
  const fixedRe = new RegExp(`\\+\\s*(\\d+)\\s*${ABILITY_NAME_RE}`, 'gi');
  let m;
  while ((m = fixedRe.exec(block)) !== null) {
    out.push(abilityBonusRow(source, entry, name, m[2], Number(m[1]), null, m[0].trim()));
  }
  return out;
}

export function parseSkillBonusesFromHtml(html, source, entry) {
  const text = stripHtml(html);
  const blockRe = /skill\s+bonus[s]?:?\s*([^.]+)/i;
  const block = text.match(blockRe)?.[1];
  if (!block) return [];
  const name = entry?.listing_fields?.Name ?? entry?.id ?? source;
  const out = [];
  const skillRe = /\+\s*(\d+)\s*([A-Za-z]+)/g;
  let m;
  while ((m = skillRe.exec(block)) !== null) {
    const skill = normalizeSkillId(m[2]);
    if (!SKILL_IDS.includes(skill)) continue;
    out.push({
      source,
      sourceId: entry?.id ?? null,
      sourceName: name,
      skill,
      amount: Number(m[1]),
      bonusType: 'skill',
      choiceGroup: null,
      note: m[0].trim()
    });
  }
  return out;
}

export function syncBonusesFromSelections(character, entriesBySource, featEntries = []) {
  const manualAbility = (character.abilities.bonuses ?? []).filter((b) => b.source === 'manual');
  const manualSkill = (character.skillBonuses ?? []).filter((b) => b.source === 'manual');
  const derivedAbility = [];
  const derivedSkill = [];

  for (const [source, entry] of Object.entries(entriesBySource)) {
    if (!entry) continue;
    const { ability, skill } = bonusesFromEntry(entry, source);
    for (const raw of ability) derivedAbility.push(toAbilityRow(raw, character));
    for (const raw of skill) derivedSkill.push(toSkillRow(raw, character));
  }

  for (const entry of featEntries) {
    if (!entry) continue;
    const { ability, skill } = bonusesFromEntry(entry, 'feat');
    for (const raw of ability) derivedAbility.push(toAbilityRow(raw, character));
    for (const raw of skill) derivedSkill.push(toSkillRow(raw, character));
  }

  const abilityMerged = [...derivedAbility, ...manualAbility];
  const skillMerged = [...derivedSkill, ...manualSkill];
  applyDefaultChoiceGroups(abilityMerged);
  applyDefaultChoiceGroups(skillMerged);

  character.abilities.bonuses = abilityMerged;
  character.skillBonuses = skillMerged;
  recomputeAbilityScores(character);
  recomputeSkillBonuses(character);
  return character;
}

/** @deprecated use syncBonusesFromSelections */
export function syncAbilityBonuses(character, entriesBySource) {
  return syncBonusesFromSelections(character, entriesBySource);
}

function applyDefaultChoiceGroups(bonuses) {
  const groups = new Map();
  for (const b of bonuses) {
    if (!b.choiceGroup) continue;
    if (b.source === 'race') continue;
    if (!groups.has(b.choiceGroup)) groups.set(b.choiceGroup, []);
    groups.get(b.choiceGroup).push(b);
  }
  for (const group of groups.values()) {
    if (group.some((b) => b.enabled)) continue;
    const fixed = group.find((b) => b.ability !== 'any' && !(b.alternatives?.length));
    const pick = fixed ?? group[0];
    if (pick) pick.enabled = true;
  }
}

function toAbilityRow(raw, character) {
  const id = `${raw.source}-${raw.sourceId}-${raw.ability}-${raw.amount}-${raw.choiceGroup ?? 'fixed'}`;
  const prev = (character.abilities.bonuses ?? []).find((b) => b.id === id);
  return {
    id,
    ...raw,
    enabled: prev?.enabled ?? defaultEnabled(raw, character)
  };
}

function toSkillRow(raw, character) {
  const id = `${raw.source}-${raw.sourceId}-${raw.skill}-${raw.amount}-${raw.bonusType}`;
  const prev = (character.skillBonuses ?? []).find((b) => b.id === id);
  return {
    id,
    ...raw,
    enabled: prev?.enabled ?? true
  };
}

function defaultEnabled(raw, character) {
  const prev = (character.abilities.bonuses ?? []).find(
    (b) =>
      b.source === raw.source &&
      b.sourceId === raw.sourceId &&
      b.ability === raw.ability &&
      b.choiceGroup === raw.choiceGroup
  );
  if (prev) return prev.enabled;
  if (!raw.choiceGroup) return true;
  if (raw.source === 'race') {
    return isRaceBonusChoiceEnabled(character, raw);
  }
  return false;
}

function isRaceBonusChoiceEnabled(character, raw) {
  if (raw.source !== 'race' || !raw.choiceGroup) return !raw.choiceGroup;
  const kind = raw.skill ? 'skill' : 'ability';
  const bucket = character.selections?.raceBonusChoices?.[kind] ?? {};
  const chosen = bucket[raw.choiceGroup];
  if (!chosen) return false;
  if (kind === 'ability') {
    if (raw.ability === 'any') return Boolean(chosen) && chosen !== 'any';
    return raw.ability === chosen;
  }
  return raw.skill === chosen;
}

export function ensureAbilityShape(character) {
  const ab = character.abilities;
  if (!Array.isArray(ab.bonuses)) ab.bonuses = [];
  if (!ab.baseScores) ab.baseScores = { ...ab.scores };
  if (!ab.anyChoice) ab.anyChoice = {};
  if (!Array.isArray(character.skillBonuses)) character.skillBonuses = [];
  return character;
}

export function getFinalScores(character) {
  ensureAbilityShape(character);
  return { ...character.abilities.scores };
}

export function getSkillBonusTotals(character) {
  ensureAbilityShape(character);
  return { ...(character.sheet.skillBonusTotals ?? {}) };
}

export function abilityScoreBreakdown(character) {
  ensureAbilityShape(character);
  const base = character.abilities.baseScores;
  const out = {};
  for (const key of ABILITY_KEYS) {
    out[key] = { base: Number(base[key]) || 10, adds: [], suppressed: [], total: Number(base[key]) || 10 };
  }

  const rows = resolveBonusRows(character.abilities.bonuses, character.abilities.anyChoice);
  for (const key of ABILITY_KEYS) {
    const stacked = stackBonusesOnTarget(rows, key);
    out[key].adds = stacked.applied.map((b) => ({
      label: b.sourceName,
      amount: b.amount,
      type: b.bonusType,
      typeLabel: BONUS_TYPE_LABELS[b.bonusType] ?? b.bonusType
    }));
    out[key].suppressed = stacked.suppressed;
    out[key].total = out[key].base + stacked.total;
  }
  return out;
}

export function skillBonusBreakdown(character) {
  ensureAbilityShape(character);
  const out = {};
  for (const id of SKILL_IDS) {
    out[id] = { adds: [], suppressed: [], total: 0 };
  }
  const rows = resolveBonusRows(character.skillBonuses, {});
  for (const id of SKILL_IDS) {
    const stacked = stackBonusesOnTarget(rows, id);
    out[id].adds = stacked.applied.map((b) => ({
      label: b.sourceName,
      amount: b.amount,
      type: b.bonusType,
      typeLabel: BONUS_TYPE_LABELS[b.bonusType] ?? b.bonusType
    }));
    out[id].suppressed = stacked.suppressed;
    out[id].total = stacked.total;
  }
  return out;
}

export function formatBreakdownLine(key, breakdown) {
  const row = breakdown[key];
  if (!row.adds.length) return `${row.base}`;
  const parts = [
    String(row.base),
    ...row.adds.map((a) => `+${a.amount} ${a.typeLabel}`)
  ];
  return `${parts.join(' ')} = ${row.total}`;
}

export function formatSkillBreakdownLine(skillId, breakdown) {
  const row = breakdown[skillId];
  if (!row.total) return '—';
  const parts = row.adds.map((a) => `+${a.amount} ${a.typeLabel}`);
  return `${parts.join(' ')} = +${row.total} (sheet Misc)`;
}

export function recomputeAbilityScores(character) {
  ensureAbilityShape(character);
  const breakdown = abilityScoreBreakdown(character);
  character.abilities.scores = Object.fromEntries(
    ABILITY_KEYS.map((k) => [k, breakdown[k].total])
  );
  character.abilities._appliedBonusIds = breakdown
    ? Object.values(breakdown).flatMap((r) => r.adds.map((a) => a.label))
    : [];
  return character;
}

export function recomputeSkillBonuses(character) {
  ensureAbilityShape(character);
  const breakdown = skillBonusBreakdown(character);
  character.sheet.skillBonusTotals = Object.fromEntries(
    SKILL_IDS.filter((id) => breakdown[id].total > 0).map((id) => [id, breakdown[id].total])
  );
  return character;
}

export function setBonusEnabled(character, bonusId, enabled, list = 'ability') {
  const arr = list === 'skill' ? character.skillBonuses : character.abilities.bonuses;
  const bonus = arr.find((b) => b.id === bonusId);
  if (!bonus) return character;
  bonus.enabled = enabled;
  if (enabled && bonus.choiceGroup) {
    for (const other of arr) {
      if (other.id !== bonusId && other.choiceGroup === bonus.choiceGroup) {
        other.enabled = false;
      }
    }
  }
  if (list === 'ability' && bonus.ability === 'any' && enabled) {
    character.abilities.anyChoice = character.abilities.anyChoice ?? {};
    if (!character.abilities.anyChoice[bonusId]) {
      character.abilities.anyChoice[bonusId] = 'str';
    }
  }
  recomputeAbilityScores(character);
  recomputeSkillBonuses(character);
  return character;
}

export function setAnyBonusAbility(character, bonusId, abilityKey) {
  character.abilities.anyChoice = character.abilities.anyChoice ?? {};
  character.abilities.anyChoice[bonusId] = abilityKey;
  recomputeAbilityScores(character);
  return character;
}

export function setBaseScore(character, ability, value) {
  ensureAbilityShape(character);
  const v = Math.min(18, Math.max(8, Number(value) || 10));
  character.abilities.baseScores[ability] = v;
  recomputeAbilityScores(character);
  return character;
}

export function tutorWarnings(character) {
  const warnings = [];
  const abilityBreak = abilityScoreBreakdown(character);
  const skillBreak = skillBonusBreakdown(character);

  for (const b of character.abilities.bonuses ?? []) {
    if (b.enabled && b.ability === 'any' && !character.abilities.anyChoice?.[b.id]) {
      warnings.push(`Choose which ability receives ${b.sourceName}'s bonus.`);
    }
  }

  for (const row of Object.values(abilityBreak)) {
    for (const { bonus, reason } of row.suppressed) {
      const target =
        bonus.ability === 'any'
          ? character.abilities.anyChoice?.[bonus.id]?.toUpperCase()
          : bonus.ability?.toUpperCase();
      warnings.push(`${bonus.sourceName} → ${target}: ${reason}`);
    }
  }

  for (const id of SKILL_IDS) {
    for (const { bonus, reason } of skillBreak[id].suppressed) {
      warnings.push(`${bonus.sourceName} → ${id}: ${reason}`);
    }
  }

  return warnings;
}

export function formatBonusSummary(character) {
  const ab = (character.abilities.bonuses ?? []).filter((b) => b.enabled);
  const sk = (character.skillBonuses ?? []).filter((b) => b.enabled);
  const parts = [
    ...ab.map((b) => {
      const t = BONUS_TYPE_LABELS[b.bonusType] ?? b.bonusType;
      const a =
        b.ability === 'any'
          ? (character.abilities.anyChoice?.[b.id] ?? character.selections?.raceBonusChoices?.ability?.[b.choiceGroup] ?? '?').toUpperCase()
          : b.ability.toUpperCase();
      return `${b.sourceName} (+${b.amount} ${a}, ${t})`;
    }),
    ...sk.map((b) => {
      const t = BONUS_TYPE_LABELS[b.bonusType] ?? b.bonusType;
      return `${b.sourceName} (+${b.amount} ${b.skill}, ${t})`;
    })
  ];
  return parts.length ? parts.join(' · ') : 'No bonuses enabled';
}

/**
 * @param {object | null | undefined} entry
 */
export function parseRaceBonusDecisions(entry) {
  if (!entry) return [];
  const { ability, skill } = bonusesFromEntry(entry, 'race');
  /** @type {Array<{ choiceGroup: string, kind: 'ability'|'skill', options: Array<{ ability?: string, skill?: string, amount: number }>, prompt: string }>} */
  const out = [];

  const abilityGroups = new Map();
  for (const b of ability) {
    if (!b.choiceGroup) continue;
    if (!abilityGroups.has(b.choiceGroup)) abilityGroups.set(b.choiceGroup, []);
    abilityGroups.get(b.choiceGroup).push(b);
  }
  for (const [choiceGroup, rows] of abilityGroups) {
    const options = [];
    const seen = new Set();
    for (const r of rows) {
      const key = r.ability === 'any' ? 'any' : r.ability;
      if (seen.has(key)) continue;
      seen.add(key);
      options.push({ ability: r.ability, amount: r.amount });
    }
    if (!options.length) continue;
    out.push({
      choiceGroup,
      kind: 'ability',
      options,
      prompt: rows[0]?.note || 'Choose an ability bonus.'
    });
  }

  const skillGroups = new Map();
  for (const b of skill) {
    if (!b.choiceGroup) continue;
    if (!skillGroups.has(b.choiceGroup)) skillGroups.set(b.choiceGroup, []);
    skillGroups.get(b.choiceGroup).push(b);
  }
  for (const [choiceGroup, rows] of skillGroups) {
    const options = rows.map((r) => ({ skill: r.skill, amount: r.amount }));
    out.push({
      choiceGroup,
      kind: 'skill',
      options,
      prompt: rows[0]?.note || 'Choose a skill bonus.'
    });
  }

  return out;
}

/**
 * @param {object} character
 * @param {'ability'|'skill'} kind
 * @param {string} choiceGroup
 * @param {string} value
 */
export function applyRaceBonusChoice(character, kind, choiceGroup, value) {
  ensureAbilityShape(character);
  character.selections = character.selections ?? {};
  if (!character.selections.raceBonusChoices) {
    character.selections.raceBonusChoices = { ability: {}, skill: {} };
  }
  character.selections.raceBonusChoices[kind] = character.selections.raceBonusChoices[kind] ?? {};
  character.selections.raceBonusChoices[kind][choiceGroup] = value;
  syncRaceBonusChoicesToBonuses(character);
  return character;
}

export function syncRaceBonusChoicesToBonuses(character) {
  ensureAbilityShape(character);
  const choices = character.selections?.raceBonusChoices ?? { ability: {}, skill: {} };

  for (const b of character.abilities.bonuses ?? []) {
    if (b.source !== 'race' || !b.choiceGroup) continue;
    b.enabled = isRaceBonusChoiceEnabled(character, b);
    if (b.enabled && b.ability === 'any') {
      const picked = choices.ability?.[b.choiceGroup];
      if (picked && picked !== 'any') {
        character.abilities.anyChoice = character.abilities.anyChoice ?? {};
        character.abilities.anyChoice[b.id] = picked;
      }
    }
  }

  for (const b of character.skillBonuses ?? []) {
    if (b.source !== 'race' || !b.choiceGroup) continue;
    b.enabled = isRaceBonusChoiceEnabled(character, b);
  }

  recomputeAbilityScores(character);
  recomputeSkillBonuses(character);
  return character;
}
