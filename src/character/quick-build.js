import { createCharacter, autoPointBuy } from './model.js';
import { compendium } from '../data/compendium.js';
import { xpForLevel } from '../formulas.js';
import {
  getFeatSlotsForLevel,
  setFeatForSlot,
  tierForFeatLevel
} from './feat-selections.js';
import { migrateEquipmentIdsToItems } from './equipment-selections.js';
import {
  ensureAbilityShape,
  recomputeAbilityScores,
  recomputeSkillBonuses,
  syncBonusesFromSelections
} from './tutor.js';
import presets from '../../metadata/quick-build-presets.json';

function pickRandom(items, rng = Math.random) {
  return items[Math.floor(rng() * items.length)];
}

function slugForRaceName(name) {
  return presets.raceNameSlugs?.[name] ?? 'human';
}

function randomName(raceName, rng = Math.random) {
  const slug = slugForRaceName(raceName);
  const pool = presets.names?.[slug] ?? presets.names?.human;
  const given = pickRandom(pool.given, rng);
  const family = pickRandom(pool.family, rng);
  return `${given} ${family}`;
}

async function resolveEntryByName(category, name) {
  const list = await compendium.listEntries(category, { limit: 500 });
  const needle = String(name).trim().toLowerCase();
  const hit = list.find((e) => (e.listing_fields?.Name ?? '').toLowerCase() === needle);
  if (!hit) throw new Error(`Unknown ${category}: ${name}`);
  const full = await compendium.getEntry(hit.id);
  if (!full) throw new Error(`Compendium entry missing: ${hit.id}`);
  return full;
}

function featPoolForTier(tier) {
  return presets.featPools?.[tier] ?? presets.featPools?.Heroic ?? [];
}

function filterFeats(entries, { tier, level, className }) {
  return entries.filter((entry) => {
    const entryTier = (entry.listing_fields?.Tier ?? 'Heroic').toLowerCase();
    const want = tier.toLowerCase();
    if (!(entryTier === want || (want === 'heroic' && !entryTier.includes('paragon') && !entryTier.includes('epic')))) {
      return false;
    }
    const prereq = (entry.listing_fields?.Prerequisite ?? '').toLowerCase();
    if (prereq.includes('21st level') && level < 21) return false;
    if (prereq && prereq !== '—' && prereq !== '-' && className && !prereq.includes(className.toLowerCase()) && tier !== 'Heroic') {
      return false;
    }
    return true;
  });
}

/**
 * GM quick-build: race, class, level → playable stub character.
 * @param {object} opts
 */
export async function buildQuickCharacter(opts = {}) {
  await compendium.ready();

  const level = Math.min(30, Math.max(1, Math.floor(Number(opts.level) || 1)));
  const raceEntry = await resolveEntryByName('race', opts.race);
  const classEntry = await resolveEntryByName('class', opts.class ?? opts.className);
  const className = classEntry.listing_fields?.Name ?? 'Adventurer';
  const raceName = raceEntry.listing_fields?.Name ?? 'Unknown';
  const classPreset = presets.classes?.[className] ?? presets.classes?.Fighter;
  const characterName =
    String(opts.characterName ?? '').trim() || randomName(raceName, opts.rng ?? Math.random);

  const character = createCharacter({
    meta: { source: 'gm-quick-build', campaignId: opts.campaignId ?? null },
    identity: {
      playerName: String(opts.playerName ?? '').trim() || 'GM',
      characterName,
      level,
      race: raceName,
      class: className,
      role: classEntry.listing_fields?.RoleName ?? '',
      size: raceEntry.listing_fields?.Size ?? 'Medium',
      totalXp: xpForLevel(level),
      alignment: 'Unaligned'
    },
    selections: {
      raceId: raceEntry.id,
      classId: classEntry.id,
      backgroundId: classPreset?.defaultBackgroundId ?? null,
      themeId: classPreset?.defaultThemeId ?? null,
      equipmentIds: [...(classPreset?.startingEquipmentIds ?? [])]
    },
    abilities: {
      method: 'point-buy-22',
      baseScores: autoPointBuy(classPreset?.primaryAbilities ?? ['str', 'con']),
      scores: {},
      bonuses: [],
      anyChoice: {}
    }
  });

  migrateEquipmentIdsToItems(character);

  if (character.selections.backgroundId) {
    const bg = await compendium.getEntry(character.selections.backgroundId);
    if (bg) character.identity.background = bg.listing_fields?.Name ?? '';
  }

  const featList = await compendium.listEntries('feat', { limit: 500 });
  const usedFeats = new Set();
  for (const slot of getFeatSlotsForLevel(level)) {
    const tier = tierForFeatLevel(slot.slotLevel);
    const pool = filterFeats(featList, { tier, level, className });
    const ids = pool.map((f) => f.id);
    const fallback = featPoolForTier(tier);
    const choices = ids.filter((id) => !usedFeats.has(id));
    const pickFrom = choices.length ? choices : fallback.filter((id) => !usedFeats.has(id));
    const pick = pickFrom.length ? pickRandom(pickFrom, opts.rng ?? Math.random) : fallback[0];
    if (pick) {
      usedFeats.add(pick);
      setFeatForSlot(character, slot.id, pick);
    }
  }

  const entriesBySource = { race: raceEntry, class: classEntry };
  if (character.selections.backgroundId) {
    entriesBySource.background = await compendium.getEntry(character.selections.backgroundId);
  }
  const featEntries = [];
  for (const slot of getFeatSlotsForLevel(level)) {
    const id = character.selections.featSelections?.[slot.id];
    if (id) {
      const entry = await compendium.getEntry(id);
      if (entry) featEntries.push(entry);
    }
  }
  syncBonusesFromSelections(character, entriesBySource, featEntries);
  ensureAbilityShape(character);
  recomputeAbilityScores(character);
  recomputeSkillBonuses(character);

  const sheetPreset = classPreset?.sheet ?? {};
  const maxHp = (sheetPreset.maxHpAt1 ?? 24) + (level - 1) * (sheetPreset.hpPerLevel ?? 5);
  character.sheet.hp = {
    max: maxHp,
    current: maxHp,
    temp: 0,
    surgesPerDay: sheetPreset.surgesPerDay ?? 7,
    surgeUses: 0
  };
  character.sheet.speed = {
    base: sheetPreset.baseSpeed ?? 6,
    armor: 0,
    item: 0,
    misc: 0
  };
  character.notes.classFeatures = String(classEntry.body_html ?? '').replace(/<[^>]+>/g, ' ').trim();
  character.notes.raceFeatures = raceEntry.body_html
    ? String(raceEntry.body_html).replace(/<[^>]+>/g, ' ').trim()
    : '';

  return character;
}
