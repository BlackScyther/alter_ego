import { createCharacter } from './model.js';

/**
 * @param {object} partial
 */
export function createActorDocument(partial = {}) {
  const base = createCharacter(partial);
  return {
    ...base,
    ...partial,
    meta: {
      ...base.meta,
      source: partial.meta?.source ?? 'game-editor',
      owner: 'gm',
      actorKind: partial.meta?.actorKind ?? 'npc',
      encounterId: partial.meta?.encounterId ?? null,
      templateCompendiumId: partial.meta?.templateCompendiumId ?? null,
      instanceLabel: partial.meta?.instanceLabel ?? '',
      linkedCharacterId: partial.meta?.linkedCharacterId ?? null,
      campaignId: partial.meta?.campaignId ?? null,
      ...partial.meta
    }
  };
}

/**
 * @param {import('../data/compendium.js').CompendiumEntry | object} entry
 * @param {{ encounterId: string, campaignId: string, instanceLabel?: string, categorySlug?: string }} ctx
 */
export function spawnFromCompendiumEntry(entry, ctx) {
  const fields = entry.listing_fields || {};
  const name = String(fields.Name || entry.id || 'Creature').trim();
  const level = Math.min(30, Math.max(1, Number(fields.Level) || 1));
  const hpMax = Math.max(1, Number(fields.HP) || level * 8 + 10);
  const ac = Number(fields.AC) || 10 + Math.floor(level / 2);
  const category = entry.category_slug || ctx.categorySlug || 'monster';
  const actorKind = category === 'monster' ? 'monster' : 'npc';

  const doc = createActorDocument({
    identity: {
      characterName: ctx.instanceLabel ? `${name} (${ctx.instanceLabel})` : name,
      level,
      race: fields.CreatureType || fields.Type || category,
      class: fields.CombatRole || '',
      size: fields.Size || 'Medium',
      role: fields.CombatRole || fields.GroupRole || ''
    },
    sheet: {
      hp: { max: hpMax, current: hpMax, temp: 0, surgesPerDay: 0, surgeUses: 0 },
      defenses: {
        ac: { abil: 0, class: ac, feat: 0, enh: 0, misc: 0, armor: 0 },
        fort: { abil: 0, class: Number(fields.Fort) || ac - 2, feat: 0, enh: 0, misc: 0 },
        ref: { abil: 0, class: Number(fields.Ref) || ac - 2, feat: 0, enh: 0, misc: 0 },
        will: { abil: 0, class: Number(fields.Will) || ac - 2, feat: 0, enh: 0, misc: 0 }
      },
      initMisc: Number(fields.Initiative) || 0
    },
    meta: {
      encounterId: ctx.encounterId,
      campaignId: ctx.campaignId,
      templateCompendiumId: entry.id,
      instanceLabel: ctx.instanceLabel || '',
      actorKind,
      source: 'compendium-spawn'
    },
    notes: {
      raceFeatures: entry.body_html
        ? String(entry.body_html).replace(/<[^>]+>/g, ' ').slice(0, 500)
        : ''
    }
  });
  return doc;
}

/**
 * @param {object} partyCharacter
 * @param {{ encounterId: string, campaignId: string, mode: 'link'|'copy', instanceLabel?: string }} ctx
 */
export function spawnFromPartyCharacter(partyCharacter, ctx) {
  if (ctx.mode === 'link') {
    const name = partyCharacter.identity?.characterName || 'PC';
    return createActorDocument({
      identity: {
        ...partyCharacter.identity,
        characterName: ctx.instanceLabel
          ? `${name} (${ctx.instanceLabel})`
          : name
      },
      abilities: partyCharacter.abilities,
      selections: partyCharacter.selections,
      sheet: structuredClone(partyCharacter.sheet || {}),
      skillBonuses: partyCharacter.skillBonuses,
      notes: partyCharacter.notes,
      meta: {
        encounterId: ctx.encounterId,
        campaignId: ctx.campaignId,
        actorKind: 'pc',
        linkedCharacterId: partyCharacter.id,
        source: 'party-link'
      }
    });
  }

  const copy = structuredClone(partyCharacter);
  delete copy.id;
  const name = copy.identity?.characterName || 'PC';
  return createActorDocument({
    ...copy,
    identity: {
      ...copy.identity,
      characterName: ctx.instanceLabel ? `${name} (${ctx.instanceLabel})` : `${name} (copy)`,
      playerName: ''
    },
    meta: {
      encounterId: ctx.encounterId,
      campaignId: ctx.campaignId,
      actorKind: 'pc',
      source: 'party-copy'
    }
  });
}

/**
 * @param {object} sourceDoc
 * @param {{ encounterId: string, campaignId: string, instanceLabel: string }} ctx
 */
export function duplicateActorDocument(sourceDoc, ctx) {
  const name =
    sourceDoc.identity?.characterName?.replace(/\s*\([^)]*\)\s*$/, '').trim() || 'NPC';
  const cloned = structuredClone(sourceDoc);
  delete cloned.id;
  return createActorDocument({
    ...cloned,
    identity: {
      ...sourceDoc.identity,
      characterName: ctx.instanceLabel ? `${name} (${ctx.instanceLabel})` : `${name} (copy)`
    },
    meta: {
      encounterId: ctx.encounterId,
      campaignId: ctx.campaignId,
      actorKind: sourceDoc.meta?.actorKind || 'npc',
      templateCompendiumId: sourceDoc.meta?.templateCompendiumId || null,
      instanceLabel: ctx.instanceLabel || '',
      linkedCharacterId: null,
      source: 'duplicate'
    }
  });
}

/** @param {{ encounterId: string, campaignId: string, name?: string }} ctx */
export function spawnBlankNpc(ctx) {
  const name = ctx.name?.trim() || 'New NPC';
  return createActorDocument({
    identity: { characterName: name, level: 1 },
    sheet: {
      hp: { max: 20, current: 20, temp: 0, surgesPerDay: 0, surgeUses: 0 }
    },
    meta: {
      encounterId: ctx.encounterId,
      campaignId: ctx.campaignId,
      actorKind: 'npc',
      source: 'blank'
    }
  });
}

/**
 * @param {Array<{ character: object }>} actors
 * @param {string} templateId
 */
export function nextInstanceLabel(actors, templateId) {
  const same = actors.filter(
    (a) => a.character?.meta?.templateCompendiumId === templateId
  ).length;
  return same ? String(same + 1) : '';
}
