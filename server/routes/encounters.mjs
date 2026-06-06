import { Router } from 'express';
import crypto from 'crypto';
import {
  insertEncounter,
  listEncounters,
  getEncounter,
  deleteEncounter,
  touchEncounter,
  listEncounterActors,
  getEncounterActor,
  upsertEncounterActor,
  deleteEncounterActor
} from '../db.mjs';
import { requireCampaignToken } from '../auth.mjs';
import { prepareCharacterForCampaign } from '../validate-character.mjs';
import { buildActorFromRequest, hydrateLinkedPartyActors } from '../spawn-actor.mjs';

const router = Router({ mergeParams: true });

router.use(requireCampaignToken('gm'));

router.get('/', (req, res) => {
  const rows = listEncounters(req.params.id);
  res.json({
    campaignId: req.params.id,
    encounters: rows.map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }))
  });
});

router.post('/', (req, res) => {
  const name =
    String(req.body?.name || 'Encounter').trim().slice(0, 120) || 'Encounter';
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  insertEncounter({
    id,
    campaignId: req.params.id,
    name,
    createdAt: now,
    updatedAt: now
  });
  res.status(201).json({ id, name, createdAt: now, updatedAt: now });
});

router.get('/:eid', (req, res) => {
  const encounter = getEncounter(req.params.eid, req.params.id);
  if (!encounter) {
    res.status(404).json({ error: 'Encounter not found.' });
    return;
  }
  let actors = listEncounterActors(req.params.eid);
  actors = hydrateLinkedPartyActors(req.params.id, actors);
  res.json({
    id: encounter.id,
    name: encounter.name,
    campaignId: req.params.id,
    createdAt: encounter.created_at,
    updatedAt: encounter.updated_at,
    actors: actors.map((a) => ({
      actorId: a.actorId,
      actorKind: a.actorKind,
      templateId: a.templateId,
      linkedCharacterId: a.linkedCharacterId,
      updatedAt: a.updatedAt,
      character: a.character
    }))
  });
});

router.delete('/:eid', (req, res) => {
  const ok = deleteEncounter(req.params.eid, req.params.id);
  if (!ok) {
    res.status(404).json({ error: 'Encounter not found.' });
    return;
  }
  res.json({ ok: true });
});

router.post('/:eid/actors', (req, res) => {
  const encounter = getEncounter(req.params.eid, req.params.id);
  if (!encounter) {
    res.status(404).json({ error: 'Encounter not found.' });
    return;
  }

  let document;
  try {
    document = buildActorFromRequest({
      encounterId: req.params.eid,
      campaignId: req.params.id,
      body: req.body
    });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
    return;
  }

  try {
    document = prepareCharacterForCampaign(document, req.params.id);
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
    return;
  }

  const now = new Date().toISOString();
  document.meta = {
    ...document.meta,
    encounterId: req.params.eid,
    campaignId: req.params.id,
    owner: 'gm',
    updatedAt: now
  };

  const actors = listEncounterActors(req.params.eid);
  const sortOrder = actors.length;

  upsertEncounterActor({
    encounterId: req.params.eid,
    actorId: document.id,
    sortOrder,
    templateId: document.meta?.templateCompendiumId || null,
    actorKind: document.meta?.actorKind || 'npc',
    linkedCharacterId: document.meta?.linkedCharacterId || null,
    documentJson: JSON.stringify(document),
    updatedAt: now
  });
  touchEncounter(req.params.eid, now);

  res.status(201).json({ ok: true, actorId: document.id, character: document });
});

router.put('/:eid/actors/:actorId', (req, res) => {
  const encounter = getEncounter(req.params.eid, req.params.id);
  if (!encounter) {
    res.status(404).json({ error: 'Encounter not found.' });
    return;
  }

  const existing = getEncounterActor(req.params.eid, req.params.actorId);
  if (!existing) {
    res.status(404).json({ error: 'Actor not found.' });
    return;
  }

  if (existing.character?.meta?.linkedCharacterId) {
    res.status(403).json({
      error: 'Linked party characters are read-only in the encounter. Use a copy instead.'
    });
    return;
  }

  if (req.body?.id && req.body.id !== req.params.actorId) {
    res.status(400).json({ error: 'Actor id in URL and body must match.' });
    return;
  }

  let document;
  try {
    document = prepareCharacterForCampaign(
      { ...req.body, id: req.params.actorId },
      req.params.id
    );
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
    return;
  }

  const now = new Date().toISOString();
  document.meta = {
    ...document.meta,
    encounterId: req.params.eid,
    campaignId: req.params.id,
    owner: 'gm',
    updatedAt: now
  };

  upsertEncounterActor({
    encounterId: req.params.eid,
    actorId: req.params.actorId,
    sortOrder: existing.sortOrder,
    templateId: document.meta?.templateCompendiumId || existing.templateId,
    actorKind: document.meta?.actorKind || existing.actorKind,
    linkedCharacterId: document.meta?.linkedCharacterId || null,
    documentJson: JSON.stringify(document),
    updatedAt: now
  });
  touchEncounter(req.params.eid, now);

  res.json({ ok: true, character: document, updatedAt: now });
});

router.patch('/:eid/actors/:actorId/initiative', (req, res) => {
  const encounter = getEncounter(req.params.eid, req.params.id);
  if (!encounter) {
    res.status(404).json({ error: 'Encounter not found.' });
    return;
  }

  const existing = getEncounterActor(req.params.eid, req.params.actorId);
  if (!existing) {
    res.status(404).json({ error: 'Actor not found.' });
    return;
  }

  const document = { ...existing.character };
  document.sheet = document.sheet ?? {};
  document.sheet.combat = document.sheet.combat ?? {};

  const { initiative = null, initiativeRoll = null } = req.body ?? {};
  document.sheet.combat.initiative = initiative;
  document.sheet.combat.initiativeRoll = initiativeRoll;

  const now = new Date().toISOString();
  document.meta = { ...document.meta, updatedAt: now };

  upsertEncounterActor({
    encounterId: req.params.eid,
    actorId: req.params.actorId,
    sortOrder: existing.sortOrder,
    templateId: existing.templateId,
    actorKind: existing.actorKind,
    linkedCharacterId: existing.linkedCharacterId,
    documentJson: JSON.stringify(document),
    updatedAt: now
  });
  touchEncounter(req.params.eid, now);

  res.json({ ok: true, character: document, updatedAt: now });
});

router.delete('/:eid/actors/:actorId', (req, res) => {
  const ok = deleteEncounterActor(req.params.eid, req.params.actorId);
  if (!ok) {
    res.status(404).json({ error: 'Actor not found.' });
    return;
  }
  touchEncounter(req.params.eid, new Date().toISOString());
  res.json({ ok: true });
});

export default router;
