import { Router } from 'express';
import crypto from 'crypto';
import {
  insertCampaign,
  upsertCharacter,
  listCharacters
} from '../db.mjs';
import { generateToken, hashToken, requireCampaignToken } from '../auth.mjs';
import { prepareCharacterForCampaign } from '../validate-character.mjs';
import encountersRouter from './encounters.mjs';

const router = Router();

router.use('/:id/encounters', encountersRouter);

function publicAppUrl() {
  return (process.env.PUBLIC_APP_URL || 'http://localhost:5173').replace(/\/$/, '');
}

function buildInviteUrl(campaignId, playerToken) {
  const base = publicAppUrl();
  const params = new URLSearchParams({ c: campaignId, t: playerToken });
  return `${base}/src/join/index.html?${params.toString()}`;
}

router.post('/', (req, res) => {
  const name = String(req.body?.name || 'Our campaign').trim().slice(0, 120) || 'Our campaign';
  const campaignId = crypto.randomUUID();
  const gmToken = generateToken();
  const playerToken = generateToken();
  const createdAt = new Date().toISOString();

  insertCampaign({
    id: campaignId,
    name,
    gmTokenHash: hashToken(gmToken),
    playerTokenHash: hashToken(playerToken),
    createdAt
  });

  res.status(201).json({
    campaignId,
    name,
    gmToken,
    playerToken,
    inviteUrl: buildInviteUrl(campaignId, playerToken)
  });
});

router.get('/:id/characters', requireCampaignToken('gm'), (req, res) => {
  const entries = listCharacters(req.params.id);
  res.json({
    campaignId: req.params.id,
    name: req.campaign.name,
    characters: entries.map((e) => ({
      file: `${e.character.identity?.characterName || 'Character'}_${e.character.identity?.level || 1}.json`,
      character: e.character,
      updatedAt: e.updatedAt
    }))
  });
});

router.put(
  '/:id/characters/:characterId',
  requireCampaignToken('player'),
  (req, res) => {
    const { id: campaignId, characterId } = req.params;
    if (req.body?.id && req.body.id !== characterId) {
      res.status(400).json({ error: 'Character id in URL and body must match.' });
      return;
    }

    let document;
    try {
      document = prepareCharacterForCampaign(
        { ...req.body, id: characterId },
        campaignId
      );
    } catch (err) {
      res.status(err.status || 400).json({ error: err.message });
      return;
    }

    const updatedAt = new Date().toISOString();
    document.meta.updatedAt = updatedAt;

    upsertCharacter({
      campaignId,
      characterId,
      playerName: String(document.identity?.playerName || '').trim(),
      documentJson: JSON.stringify(document),
      updatedAt
    });

    res.json({ ok: true, character: document, updatedAt });
  }
);

export default router;
