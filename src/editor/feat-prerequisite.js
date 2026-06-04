/**
 * Heuristic feat prerequisite filtering from listing_fields.Prerequisite text.
 */

import { getRaceMatchTerms } from './background-prerequisite.js';
import { filterEntriesBySearch, COMPENDIUM_SEARCH_MIN } from './picker/combobox-picker.js';
const EMPTY_PREREQ = new Set(['', '—', '-', 'none', 'n/a']);

const ABILITY_ALIASES = {
  str: ['str', 'strength'],
  con: ['con', 'constitution'],
  dex: ['dex', 'dexterity'],
  int: ['int', 'intelligence'],
  wis: ['wis', 'wisdom'],
  cha: ['cha', 'charisma']
};

const MARTIAL_KEYWORDS = ['martial', 'weapon'];
const DIVINE_KEYWORDS = ['divine', 'cleric', 'paladin'];
const ARCANE_KEYWORDS = ['arcane', 'wizard', 'sorcerer', 'warlock'];
const PREREQ_HINT_WORDS =
  /\b(prerequisite|must|requires?|trained|level|paragon|epic|heroic|feat|background|race|class)\b/i;

/**
 * @param {string} raw
 */
export function normalizePrerequisiteText(raw) {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {string} prereq
 */
export function isEmptyPrerequisite(prereq) {
  const n = normalizePrerequisiteText(prereq).toLowerCase();
  return EMPTY_PREREQ.has(n);
}

/**
 * @param {string} tier
 * @param {string} slotTier
 */
export function featMatchesSlotTier(listingTier, slotTier) {
  const t = (listingTier ?? 'Heroic').toLowerCase();
  const slot = slotTier.toLowerCase();
  if (t === slot) return true;
  if (slot === 'heroic' && !t.includes('paragon') && !t.includes('epic')) return true;
  return false;
}

/**
 * @param {string} prereq
 * @param {number} characterLevel
 * @param {number} slotLevel
 */
export function prereqPassesLevelGate(prereq, characterLevel, slotLevel) {
  const p = prereq.toLowerCase();
  if (p.includes('21st level') && characterLevel < 21) return false;
  if (p.includes('11th level') && characterLevel < 11) return false;

  const levelMatch = p.match(/(\d+)(?:st|nd|rd|th)?\s+level/g);
  if (levelMatch) {
    for (const m of levelMatch) {
      const num = parseInt(m, 10);
      if (!Number.isNaN(num) && characterLevel < num) return false;
    }
  }

  if (p.includes('paragon tier') && slotLevel < 11) return false;
  if (p.includes('epic tier') && slotLevel < 21) return false;

  return true;
}

/**
 * @param {string} prereq
 * @param {string[]} raceTerms
 */
export function prereqPassesRace(prereq, raceTerms) {
  if (!raceTerms.length) return true;
  const p = prereq.toLowerCase();
  const races = [
    'dragonborn',
    'dwarf',
    'elf',
    'eladrin',
    'drow',
    'human',
    'tiefling',
    'halfling',
    'gnome',
    'goliath',
    'half-elf',
    'half-orc',
    'deva',
    'genasi',
    'shifter',
    'warforged',
    'githzerai',
    'githyanki',
    'minotaur',
    'revenant'
  ];
  const mentioned = races.filter((r) => p.includes(r));
  if (!mentioned.length) return true;
  return mentioned.some((r) => raceTerms.some((t) => t.toLowerCase().includes(r) || r.includes(t.toLowerCase())));
}

/**
 * @param {string} prereq
 * @param {{ className?: string, role?: string, powerSource?: string }} classInfo
 */
export function prereqPassesClass(prereq, classInfo) {
  const className = (classInfo.className ?? '').trim();
  if (!className) return true;

  const p = prereq.toLowerCase();
  const cn = className.toLowerCase();
  const role = (classInfo.role ?? '').toLowerCase();
  const ps = (classInfo.powerSource ?? '').toLowerCase();

  const classNames = [
    'fighter',
    'cleric',
    'wizard',
    'ranger',
    'rogue',
    'warlock',
    'warlord',
    'paladin',
    'barbarian',
    'bard',
    'druid',
    'invoker',
    'sorcerer',
    'warden',
    'artificer',
    'assassin',
    'avenger',
    'barbarian',
    'battlemind',
    'monk',
    'runepriest',
    'seeker',
    'shaman',
    'swordmage',
    'vampire'
  ];

  const mentioned = classNames.filter((c) => p.includes(c));
  if (mentioned.length) {
    if (mentioned.some((c) => cn.includes(c))) return true;
    return false;
  }

  if (p.includes('defender') && role.includes('defender')) return true;
  if (p.includes('striker') && role.includes('striker')) return true;
  if (p.includes('controller') && role.includes('controller')) return true;
  if (p.includes('leader') && role.includes('leader')) return true;

  if (MARTIAL_KEYWORDS.some((k) => p.includes(k)) && ps.includes('martial')) return true;
  if (DIVINE_KEYWORDS.some((k) => p.includes(k)) && ps.includes('divine')) return true;
  if (ARCANE_KEYWORDS.some((k) => p.includes(k)) && ps.includes('arcane')) return true;

  if (cn && p.includes(cn.split(' ')[0])) return true;

  return true;
}

/**
 * @param {string} prereq
 * @param {string} backgroundName
 */
export function prereqPassesBackground(prereq, backgroundName) {
  const bg = (backgroundName ?? '').trim();
  if (!bg) return true;
  const p = prereq.toLowerCase();
  if (!p.includes(bg.toLowerCase())) return true;
  return p.includes(bg.toLowerCase());
}

/**
 * @param {string} prereq
 * @param {Record<string, number>} scores
 */
export function prereqPassesAbilities(prereq, scores) {
  const p = prereq.toLowerCase();
  for (const [key, aliases] of Object.entries(ABILITY_ALIASES)) {
    for (const alias of aliases) {
      const re = new RegExp(`\\b${alias}\\b\\s*(?:score\\s*)?(?:of\\s*)?(\\d+)`, 'i');
      const m = p.match(re);
      if (m) {
        const need = parseInt(m[1], 10);
        const have = scores[key] ?? 10;
        if (have < need) return false;
      }
    }
  }
  return true;
}

/**
 * @param {string} prereq
 * @param {Set<string>} trainedSkills
 * @param {boolean} hasTrainingData
 */
export function prereqPassesSkills(prereq, trainedSkills, hasTrainingData) {
  const p = prereq.toLowerCase();
  if (!/trained\s+in/i.test(p)) return true;
  if (!hasTrainingData) return true;

  const m = p.match(/trained\s+in\s+([a-z]+)/i);
  if (!m) return true;
  const skill = m[1].toLowerCase();
  return trainedSkills.has(skill);
}

/**
 * @param {string} prereq
 * @param {Set<string>} ownedFeatNames
 */
export function prereqPassesFeatChain(prereq, ownedFeatNames) {
  const p = normalizePrerequisiteText(prereq);
  if (!/feat/i.test(p)) return true;

  const needsFeat = p.match(/(?:must have|requires?|prerequisite[s]?:)\s*([^.;]+)/i);
  if (!needsFeat) return true;

  const fragment = needsFeat[1].toLowerCase();
  if (fragment.includes('paragon') || fragment.includes('epic') || fragment.includes('heroic')) {
    return true;
  }

  for (const name of ownedFeatNames) {
    if (name && fragment.includes(name.toLowerCase())) return true;
  }

  return ownedFeatNames.size > 0 ? false : true;
}

/**
 * @param {string} prereq
 * @param {object} ctx
 * @param {{ tier: string, slotLevel: number }} slot
 */
export function featPassesDefaultFilter(entry, ctx, slot) {
  const fields = entry.listing_fields ?? {};
  const prereq = normalizePrerequisiteText(fields.Prerequisite);
  const tier = fields.Tier ?? 'Heroic';

  if (!featMatchesSlotTier(tier, slot.tier)) return false;
  if (!prereqPassesLevelGate(prereq, ctx.level, slot.slotLevel)) return false;

  if (isEmptyPrerequisite(prereq)) return true;

  if (!prereqPassesRace(prereq, ctx.raceTerms)) return false;
  if (!prereqPassesClass(prereq, ctx.classInfo)) return false;
  if (!prereqPassesBackground(prereq, ctx.backgroundName)) return false;
  if (!prereqPassesAbilities(prereq, ctx.abilityScores)) return false;
  if (!prereqPassesSkills(prereq, ctx.trainedSkills, ctx.hasTrainingData)) return false;
  if (!prereqPassesFeatChain(prereq, ctx.ownedFeatNames)) return false;

  if (PREREQ_HINT_WORDS.test(prereq)) {
    const checks = [
      prereqPassesRace(prereq, ctx.raceTerms),
      prereqPassesClass(prereq, ctx.classInfo),
      prereqPassesAbilities(prereq, ctx.abilityScores),
      prereqPassesSkills(prereq, ctx.trainedSkills, ctx.hasTrainingData),
      prereqPassesFeatChain(prereq, ctx.ownedFeatNames)
    ];
    if (checks.every((c) => c === true) && prereq.length > 12) {
      return false;
    }
  }

  return true;
}

/**
 * @param {import('../character/model.js').Character} character
 * @param {import('../data/compendium.js').CompendiumProvider} compendium
 * @param {import('../character/feat-selections.js').FeatSlot} [currentSlot]
 */
export async function buildFeatEligibilityContext(character, compendium, currentSlot = null) {
  const level = character.identity?.level ?? 1;
  const raceTerms = await getRaceMatchTerms(character, compendium);

  let classInfo = { className: character.identity?.class ?? '', role: '', powerSource: '' };
  if (character.selections?.classId) {
    const classEntry = await compendium.getEntry(character.selections.classId);
    if (classEntry?.listing_fields) {
      classInfo = {
        className: classEntry.listing_fields.Name ?? classInfo.className,
        role: classEntry.listing_fields.RoleName ?? '',
        powerSource: classEntry.listing_fields.PowerSourceText ?? ''
      };
    }
  }

  let backgroundName = character.identity?.background ?? '';
  if (character.selections?.backgroundId) {
    const bg = await compendium.getEntry(character.selections.backgroundId);
    if (bg?.listing_fields?.Name) backgroundName = bg.listing_fields.Name;
  }

  const scores = character.abilities?.scores ?? character.abilities?.baseScores ?? {};
  const trainedIds = character.selections?.trainedSkillIds ?? [];
  const hasTrainingData = Array.isArray(trainedIds) && trainedIds.length > 0;
  const trainedSkills = new Set(trainedIds.map((s) => String(s).toLowerCase()));

  const map = character.selections?.featSelections ?? {};
  const ownedFeatNames = new Set();
  const ownedFeatIds = new Set();

  for (const [slotId, featId] of Object.entries(map)) {
    if (!featId) continue;
    if (currentSlot && slotId === currentSlot.id) continue;
    ownedFeatIds.add(featId);
    const entry = await compendium.getEntry(featId);
    const name = entry?.listing_fields?.Name ?? featId;
    ownedFeatNames.add(name);
  }

  return {
    level,
    raceTerms,
    classInfo,
    backgroundName,
    abilityScores: scores,
    trainedSkills,
    hasTrainingData,
    ownedFeatNames,
    ownedFeatIds
  };
}

/**
 * @param {Array<{ id: string, listing_fields?: Record<string, string> }>} entries
 * @param {object} ctx
 * @param {{ id: string, slotLevel: number, tier: string }} slot
 * @param {{ showAll?: boolean, excludeIds?: Set<string> | string[], query?: string }} opts
 */
export function filterFeatEntries(entries, ctx, slot, opts = {}) {
  const showAll = !!opts.showAll;
  const exclude = opts.excludeIds instanceof Set ? opts.excludeIds : new Set(opts.excludeIds ?? []);
  const q = (opts.query ?? '').trim();

  let list = entries.filter((e) => {
    if (exclude.has(e.id)) return false;
    if (showAll) {
      return featMatchesSlotTier(e.listing_fields?.Tier, slot.tier);
    }
    return featPassesDefaultFilter(e, ctx, slot);
  });

  if (q.length > 0 && q.length < COMPENDIUM_SEARCH_MIN) {
    list = filterEntriesBySearch(list, q);
  }

  list.sort((a, b) => {
    const an = a.listing_fields?.Name ?? a.id;
    const bn = b.listing_fields?.Name ?? b.id;
    return an.localeCompare(bn, undefined, { sensitivity: 'base' });
  });

  return list;
}

/**
 * @param {Record<string, string> | undefined} fields
 */
export function formatFeatListingMeta(fields) {
  const parts = [];
  if (fields?.Tier) parts.push(fields.Tier);
  if (fields?.Prerequisite && !isEmptyPrerequisite(fields.Prerequisite)) {
    parts.push(`Prerequisite: ${fields.Prerequisite}`);
  }
  if (fields?.SourceBook) parts.push(fields.SourceBook);
  return parts.join(' · ');
}
