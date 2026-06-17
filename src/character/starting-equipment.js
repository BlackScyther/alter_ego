/**

 * Seed level-1 starting equipment kits during new-character creation only.

 */



import kitsMeta from '../../metadata/starting-equipment.json' with { type: 'json' };

import {

  addEquipmentFromCompendium,

  clearAllEquipment,

  ensureEquipmentSelectionsShape

} from './equipment-selections.js';

import { syncEquipmentToSheet } from './equipment-sheet-sync.js';



/**

 * @param {object} character

 * @param {{ builderMode?: string }} [opts]

 */

export function shouldSeedStartingEquipment(character, opts = {}) {

  if (opts.builderMode !== 'create') return false;

  if ((character.identity?.level ?? 1) !== 1) return false;

  if (character.builderFlags?.startingEquipmentSeeded) return false;

  if (!character.selections?.classId) return false;

  if ((character.selections.equipmentItems?.length ?? 0) > 0) return false;

  return Boolean(resolveStartingKit(character));

}



/**

 * @param {object} character

 * @returns {object | null}

 */

export function resolveStartingKit(character) {

  const classId = character.selections?.classId ?? '';

  const className = character.identity?.class ?? '';

  const buildId = character.selections?.classBuildChoices?.build ?? null;



  const byId = kitsMeta.byClassId?.[classId];

  const byName = className ? kitsMeta.byClassName?.[className] : null;

  const kitRoot = byId ?? byName;

  if (!kitRoot) return null;



  if (kitRoot.byBuildOption) {

    const pick =

      (buildId && kitRoot.byBuildOption[buildId]) ||

      (kitRoot.defaultBuildOption && kitRoot.byBuildOption[kitRoot.defaultBuildOption]) ||

      Object.values(kitRoot.byBuildOption)[0];

    return pick ?? null;

  }



  return kitRoot.default ?? null;

}



/**

 * @param {object} character

 * @returns {{ kit: object | null, buildLabel: string | null, available: boolean }}

 */

export function getRecommendedStartingKitMeta(character) {

  const kit = resolveStartingKit(character);

  return {

    kit,

    buildLabel: kit?.label ?? null,

    available: Boolean(kit)

  };

}



/**

 * @param {object} character

 * @param {import('../data/compendium.js').CompendiumProvider} compendium

 * @param {{ force?: boolean }} [opts]

 * @returns {Promise<{ applied: boolean, missingIds: string[] }>}

 */

export async function applyStartingKit(character, compendium, opts = {}) {

  const force = opts.force === true;

  const kit = resolveStartingKit(character);

  if (!kit) return { applied: false, missingIds: [] };



  if (!force) {

    if (character.builderFlags?.startingEquipmentSeeded) return { applied: false, missingIds: [] };

    if ((character.selections?.equipmentItems?.length ?? 0) > 0) return { applied: false, missingIds: [] };

  }



  ensureEquipmentSelectionsShape(character);

  character.builderFlags = character.builderFlags ?? {};



  if (force) {

    clearAllEquipment(character);

  }



  const missingIds = [];



  for (const row of kit.equipped ?? []) {

    const entry = await compendium.getEntry(row.compendiumId);

    if (!entry) {

      missingIds.push(row.compendiumId);

      continue;

    }

    addEquipmentFromCompendium(character, entry, row.slotId ?? null);

  }



  for (const row of kit.inventory ?? []) {

    const qty = Math.max(1, Number(row.quantity) || 1);

    const entry = await compendium.getEntry(row.compendiumId);

    if (!entry) {

      missingIds.push(row.compendiumId);

      continue;

    }

    for (let i = 0; i < qty; i++) {

      addEquipmentFromCompendium(character, entry);

    }

  }



  character.sheet.treasure = character.sheet.treasure ?? { goldGp: 0 };

  character.sheet.treasure.goldGp =

    kit.remainingGoldGp ?? kitsMeta.startingGoldGp ?? 100;



  character.builderFlags.startingEquipmentSeeded = true;



  const classEntry = await compendium.getEntry(character.selections.classId);

  await syncEquipmentToSheet(character, compendium, { classEntry });

  return { applied: true, missingIds };

}



/**

 * @param {object} character

 * @param {import('../data/compendium.js').CompendiumProvider} compendium

 * @param {{ builderMode?: string }} [opts]

 */

export async function maybeSeedStartingEquipment(character, compendium, opts = {}) {

  if (!shouldSeedStartingEquipment(character, opts)) return false;

  const result = await applyStartingKit(character, compendium);

  return result.applied;

}

