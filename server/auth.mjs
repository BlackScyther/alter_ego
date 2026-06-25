import crypto from 'crypto';
import { getCampaignById, getDb } from './db.mjs';

export function hashToken(token) {
  const pepper = process.env.TOKEN_PEPPER || 'alter-ego-dev-pepper-change-in-production';
  return crypto.createHash('sha256').update(`${pepper}:${token}`).digest('hex');
}

export function generateToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function extractBearer(req) {
  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : null;
}

export function requireCampaignToken(role) {
  return (req, res, next) => {
    const campaignId = req.params.id;
    const token = extractBearer(req);
    if (!token) {
      res.status(401).json({ error: 'Missing Authorization: Bearer token.' });
      return;
    }
    const campaign = getCampaignById(campaignId);
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found.' });
      return;
    }
    const expectedHash =
      role === 'gm' ? campaign.gm_token_hash : campaign.player_token_hash;
    const actualHash = hashToken(token);
    if (!timingSafeEqual(actualHash, expectedHash)) {
      res.status(403).json({ error: 'Invalid token for this campaign.' });
      return;
    }
    req.campaign = campaign;
    next();
  };
}

/** Validates Bearer token against any campaign GM token (for global homebrew writes). */
export function requireAnyGmToken(req, res, next) {
  const token = extractBearer(req);
  if (!token) {
    res.status(401).json({ error: 'Missing Authorization: Bearer token.' });
    return;
  }
  const actualHash = hashToken(token);
  const row = getDb()
    .prepare(`SELECT id FROM campaigns WHERE gm_token_hash = ? LIMIT 1`)
    .get(actualHash);
  if (!row) {
    res.status(403).json({ error: 'Valid GM token required.' });
    return;
  }
  next();
}
