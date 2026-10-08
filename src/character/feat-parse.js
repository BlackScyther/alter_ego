/**
 * Parse feat listing fields and body HTML into structured normalization rows.
 */

import { parseAbilityBonusesFromHtml, parseSkillBonusesFromHtml } from './tutor.js';

const EMPTY_PREREQ = new Set(['', '—', '-', 'none', 'n/a']);

/**
 * @param {string} raw
 */
export function normalizePrerequisiteText(raw) {
  return String(raw ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * @param {string} prereq
 */
export function isEmptyPrerequisite(prereq) {
  return EMPTY_PREREQ.has(normalizePrerequisiteText(prereq).toLowerCase());
}

const RACE_NAMES = [
  'dragonborn', 'dwarf', 'elf', 'eladrin', 'drow', 'human', 'tiefling', 'halfling', 'gnome',
  'goliath', 'half-elf', 'half-orc', 'deva', 'genasi', 'shifter', 'warforged', 'githzerai',
  'githyanki', 'minotaur', 'revenant', 'bugbear', 'goblin', 'kobold', 'orc'
];

const CLASS_NAMES = [
  'fighter', 'cleric', 'wizard', 'ranger', 'rogue', 'warlock', 'warlord', 'paladin', 'barbarian',
  'bard', 'druid', 'invoker', 'sorcerer', 'warden', 'artificer', 'assassin', 'avenger',
  'battlemind', 'monk', 'runepriest', 'seeker', 'shaman', 'swordmage', 'vampire', 'ardent',
  'psion', 'warpriest'
];

/**
 * @param {object | null | undefined} entry
 */
export function parseFeatListing(entry) {
  const lf = entry?.listing_fields ?? {};
  const tier = String(lf.Tier ?? 'Heroic').trim() || 'Heroic';
  return {
    id: entry?.id ?? null,
    name: lf.Name ?? entry?.id ?? null,
    tier,
    prerequisiteRaw: normalizePrerequisiteText(lf.Prerequisite ?? ''),
    sourceBook: lf.SourceBook ?? null
  };
}

/**
 * @param {string} raw
 */
export function parseFeatPrerequisites(raw) {
  const prereq = normalizePrerequisiteText(raw);
  if (isEmptyPrerequisite(prereq)) return [];

  const p = prereq.toLowerCase();
  /** @type {Array<{ kind: string, target: string | null, minValue: number | null, logicGroup: number }>} */
  const atoms = [];
  let group = 0;

  const levelMatches = prereq.matchAll(/(\d+)(?:st|nd|rd|th)?\s+level/gi);
  for (const m of levelMatches) {
    atoms.push({ kind: 'level', target: null, minValue: parseInt(m[1], 10), logicGroup: group });
  }
  if (p.includes('21st level')) atoms.push({ kind: 'level', target: null, minValue: 21, logicGroup: group });
  if (p.includes('11th level')) atoms.push({ kind: 'level', target: null, minValue: 11, logicGroup: group });
  if (p.includes('paragon tier')) atoms.push({ kind: 'level', target: null, minValue: 11, logicGroup: group });
  if (p.includes('epic tier')) atoms.push({ kind: 'level', target: null, minValue: 21, logicGroup: group });

  for (const race of RACE_NAMES) {
    if (p.includes(race)) atoms.push({ kind: 'race', target: race, minValue: null, logicGroup: group });
  }

  for (const cls of CLASS_NAMES) {
    if (p.includes(cls)) atoms.push({ kind: 'class', target: cls, minValue: null, logicGroup: group });
  }

  if (p.includes('defender')) atoms.push({ kind: 'role', target: 'defender', minValue: null, logicGroup: group });
  if (p.includes('striker')) atoms.push({ kind: 'role', target: 'striker', minValue: null, logicGroup: group });
  if (p.includes('controller')) atoms.push({ kind: 'role', target: 'controller', minValue: null, logicGroup: group });
  if (p.includes('leader')) atoms.push({ kind: 'role', target: 'leader', minValue: null, logicGroup: group });

  if (/\bmartial\b/.test(p)) atoms.push({ kind: 'power_source', target: 'martial', minValue: null, logicGroup: group });
  if (/\bdivine\b/.test(p)) atoms.push({ kind: 'power_source', target: 'divine', minValue: null, logicGroup: group });
  if (/\barcane\b/.test(p)) atoms.push({ kind: 'power_source', target: 'arcane', minValue: null, logicGroup: group });

  const abilRe = /(strength|constitution|dexterity|intelligence|wisdom|charisma|str|con|dex|int|wis|cha)\s+(\d+)/gi;
  let am;
  while ((am = abilRe.exec(prereq)) !== null) {
    const key = am[1].slice(0, 3).toLowerCase();
    atoms.push({ kind: 'ability_min', target: key, minValue: parseInt(am[2], 10), logicGroup: group });
  }

  const trainedRe = /trained\s+in\s+([a-z][a-z\s]+?)(?:\s|,|\.|$)/gi;
  while ((am = trainedRe.exec(p)) !== null) {
    atoms.push({ kind: 'skill_trained', target: am[1].trim(), minValue: null, logicGroup: group });
  }

  if (/\bfeat\b/i.test(prereq) && !atoms.length) {
    atoms.push({ kind: 'other', target: prereq.slice(0, 200), minValue: null, logicGroup: group });
  }

  if (!atoms.length && prereq) {
    atoms.push({ kind: 'other', target: prereq.slice(0, 200), minValue: null, logicGroup: group });
  }

  return atoms;
}

/**
 * @param {object} entry
 */
export function parseFeatBonuses(entry) {
  const html = entry?.body_html ?? '';
  const source = 'feat';
  const ability = parseAbilityBonusesFromHtml(html, source, entry).map((b) => ({
    ability: b.ability,
    amount: b.amount,
    choiceGroup: b.choiceGroup ?? null,
    excludesItemBonus: b.excludesItemBonus ? 1 : 0
  }));
  const skill = parseSkillBonusesFromHtml(html, source, entry).map((b) => ({
    skill: b.skill,
    amount: b.amount,
    bonusType: b.bonusType ?? 'skill'
  }));
  return { ability, skill };
}

/**
 * @param {string} html
 */
export function parseFeatGrants(html) {
  const text = String(html ?? '').replace(/<[^>]+>/g, ' ').toLowerCase();
  /** @type {Array<{ kind: string, value: string | null }>} */
  const grants = [];
  if (/ritual\s+cast/i.test(text)) grants.push({ kind: 'ritual_caster', value: null });
  return grants;
}

/**
 * @param {string} html
 */
export function parseFeatBenefitText(html) {
  return String(html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/published\s+in[\s\S]*$/i, '')
    .trim();
}
