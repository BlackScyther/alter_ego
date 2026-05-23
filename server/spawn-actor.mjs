import crypto from 'crypto';
import compendiumStub from '../data/samples/compendium-stub.json' with { type: 'json' };
import {
  createActorDocument,
  spawnFromCompendiumEntry,
  spawnFromPartyCharacter,
  duplicateActorDocument,
  spawnBlankNpc
} from '../src/character/actor-spawn.js';
import {
  countActorsWithTemplate,
  getCharacterDocument,
  getEncounterActor,
  listEncounterActors
} from './db.mjs';

function getCompendiumEntry(category, entryId) {
  const cat = compendiumStub.categories?.[category];
  const hit = cat?.entries?.find((e) => e.id === entryId);
  if (!hit) return null;
  return { ...hit, category_slug: category };
}

function instanceLabelForTemplate(encounterId, templateId) {
  const n = countActorsWithTemplate(encounterId, templateId);
  return n ? String(n + 1) : '';
}

/**
 * @param {object} opts
 * @param {string} opts.encounterId
 * @param {string} opts.campaignId
 * @param {object} opts.body
 */
export function buildActorFromRequest(opts) {
  const { encounterId, campaignId, body } = opts;
  const source = body?.source;

  if (source === 'party') {
    const characterId = String(body.characterId || '');
    const partyDoc = getCharacterDocument(campaignId, characterId);
    if (!partyDoc) {
      const err = new Error('Party character not found.');
      err.status = 404;
      throw err;
    }
    const mode = body.mode === 'copy' ? 'copy' : 'link';
    const doc = spawnFromPartyCharacter(partyDoc, {
      encounterId,
      campaignId,
      mode,
      instanceLabel: body.instanceLabel || ''
    });
    doc.id = crypto.randomUUID();
    return doc;
  }

  if (source === 'compendium') {
    const category = String(body.category || 'monster');
    const entryId = String(body.entryId || '');
    const entry = getCompendiumEntry(category, entryId);
    if (!entry) {
      const err = new Error('Compendium entry not found.');
      err.status = 404;
      throw err;
    }
    const label = instanceLabelForTemplate(encounterId, entryId);
    const doc = spawnFromCompendiumEntry(entry, {
      encounterId,
      campaignId,
      instanceLabel: label,
      categorySlug: category
    });
    doc.id = crypto.randomUUID();
    return doc;
  }

  if (source === 'duplicate') {
    const actorId = String(body.actorId || '');
    const existing = getEncounterActor(encounterId, actorId);
    if (!existing) {
      const err = new Error('Actor not found.');
      err.status = 404;
      throw err;
    }
    const templateId = existing.character.meta?.templateCompendiumId;
    const label = templateId
      ? instanceLabelForTemplate(encounterId, templateId)
      : '';
    const doc = duplicateActorDocument(existing.character, {
      encounterId,
      campaignId,
      instanceLabel: label
    });
    doc.id = crypto.randomUUID();
    return doc;
  }

  if (source === 'blank') {
    const doc = spawnBlankNpc({
      encounterId,
      campaignId,
      name: body.name
    });
    doc.id = crypto.randomUUID();
    if (body.actorKind) {
      doc.meta.actorKind = body.actorKind;
    }
    return doc;
  }

  const err = new Error('Unknown source. Use party, compendium, duplicate, or blank.');
  err.status = 400;
  throw err;
}

/**
 * Merge linked party PCs with latest player saves.
 * @param {string} campaignId
 * @param {Array} actors
 */
export function hydrateLinkedPartyActors(campaignId, actors) {
  return actors.map((row) => {
    const linked = row.linkedCharacterId || row.character?.meta?.linkedCharacterId;
    if (!linked) return row;
    const fresh = getCharacterDocument(campaignId, linked);
    if (!fresh) return row;
    const label = row.character.meta?.instanceLabel;
    const baseName = fresh.identity?.characterName || 'PC';
    const merged = {
      ...row.character,
      identity: {
        ...fresh.identity,
        characterName: label ? `${baseName} (${label})` : baseName
      },
      abilities: fresh.abilities,
      selections: fresh.selections,
      sheet: fresh.sheet,
      skillBonuses: fresh.skillBonuses,
      meta: {
        ...row.character.meta,
        linkedCharacterId: linked
      }
    };
    return { ...row, character: merged };
  });
}

export { listEncounterActors };
