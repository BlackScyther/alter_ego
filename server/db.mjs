import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_DB = path.join(__dirname, '..', 'data', 'campaigns.db');

let db;

export function getDb() {
  if (!db) {
    const dbPath = process.env.DATABASE_PATH || DEFAULT_DB;
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    migrate(db);
  }
  return db;
}

function migrate(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      gm_token_hash TEXT NOT NULL,
      player_token_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS characters (
      campaign_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      player_name TEXT NOT NULL DEFAULT '',
      document_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (campaign_id, character_id),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_characters_campaign ON characters(campaign_id);

    CREATE TABLE IF NOT EXISTS encounters (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS encounter_actors (
      encounter_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      template_id TEXT,
      actor_kind TEXT NOT NULL DEFAULT 'npc',
      linked_character_id TEXT,
      document_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (encounter_id, actor_id),
      FOREIGN KEY (encounter_id) REFERENCES encounters(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_encounters_campaign ON encounters(campaign_id);

    CREATE TABLE IF NOT EXISTS homebrew_entries (
      id TEXT PRIMARY KEY,
      category_slug TEXT NOT NULL,
      listing_fields TEXT NOT NULL,
      body_html TEXT,
      index_text TEXT,
      gm_slug TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_homebrew_category ON homebrew_entries(category_slug);
    CREATE INDEX IF NOT EXISTS idx_homebrew_gm_slug ON homebrew_entries(gm_slug);

    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      category TEXT NOT NULL,
      severity TEXT,
      area TEXT,
      role TEXT,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      app_version TEXT,
      user_agent TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      contact TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_feedback_category ON feedback(category);
    CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);
    CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at);
  `);

  const encounterCols = database.prepare(`PRAGMA table_info(encounters)`).all();
  if (!encounterCols.some((c) => c.name === 'phase')) {
    database.exec(`ALTER TABLE encounters ADD COLUMN phase TEXT NOT NULL DEFAULT 'rest'`);
  }
}

export function insertCampaign({ id, name, gmTokenHash, playerTokenHash, createdAt }) {
  getDb()
    .prepare(
      `INSERT INTO campaigns (id, name, gm_token_hash, player_token_hash, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(id, name, gmTokenHash, playerTokenHash, createdAt);
}

export function getCampaignById(id) {
  return getDb().prepare(`SELECT * FROM campaigns WHERE id = ?`).get(id);
}

export function upsertCharacter({ campaignId, characterId, playerName, documentJson, updatedAt }) {
  getDb()
    .prepare(
      `INSERT INTO characters (campaign_id, character_id, player_name, document_json, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(campaign_id, character_id) DO UPDATE SET
         player_name = excluded.player_name,
         document_json = excluded.document_json,
         updated_at = excluded.updated_at`
    )
    .run(campaignId, characterId, playerName, documentJson, updatedAt);
}

export function getCharacterDocument(campaignId, characterId) {
  const row = getDb()
    .prepare(
      `SELECT document_json FROM characters WHERE campaign_id = ? AND character_id = ?`
    )
    .get(campaignId, characterId);
  return row ? JSON.parse(row.document_json) : null;
}

export function insertEncounter({ id, campaignId, name, createdAt, updatedAt, phase = 'rest' }) {
  getDb()
    .prepare(
      `INSERT INTO encounters (id, campaign_id, name, created_at, updated_at, phase)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(id, campaignId, name, createdAt, updatedAt, phase);
}

export function listEncounters(campaignId) {
  return getDb()
    .prepare(
      `SELECT id, name, created_at, updated_at, phase FROM encounters
       WHERE campaign_id = ? ORDER BY updated_at DESC`
    )
    .all(campaignId);
}

export function updateEncounterPhase(encounterId, campaignId, phase, updatedAt) {
  const info = getDb()
    .prepare(
      `UPDATE encounters SET phase = ?, updated_at = ?
       WHERE id = ? AND campaign_id = ?`
    )
    .run(phase, updatedAt, encounterId, campaignId);
  return info.changes > 0;
}

export function getEncounter(encounterId, campaignId) {
  return getDb()
    .prepare(`SELECT * FROM encounters WHERE id = ? AND campaign_id = ?`)
    .get(encounterId, campaignId);
}

export function deleteEncounter(encounterId, campaignId) {
  const info = getDb()
    .prepare(`DELETE FROM encounters WHERE id = ? AND campaign_id = ?`)
    .run(encounterId, campaignId);
  return info.changes > 0;
}

export function touchEncounter(encounterId, updatedAt) {
  getDb()
    .prepare(`UPDATE encounters SET updated_at = ? WHERE id = ?`)
    .run(updatedAt, encounterId);
}

function rowToActor(row) {
  return {
    actorId: row.actor_id,
    sortOrder: row.sort_order,
    templateId: row.template_id,
    actorKind: row.actor_kind,
    linkedCharacterId: row.linked_character_id,
    updatedAt: row.updated_at,
    character: JSON.parse(row.document_json)
  };
}

export function listEncounterActors(encounterId) {
  const rows = getDb()
    .prepare(
      `SELECT * FROM encounter_actors WHERE encounter_id = ? ORDER BY sort_order ASC, updated_at ASC`
    )
    .all(encounterId);
  return rows.map(rowToActor);
}

export function getEncounterActor(encounterId, actorId) {
  const row = getDb()
    .prepare(`SELECT * FROM encounter_actors WHERE encounter_id = ? AND actor_id = ?`)
    .get(encounterId, actorId);
  return row ? rowToActor(row) : null;
}

export function upsertEncounterActor({
  encounterId,
  actorId,
  sortOrder,
  templateId,
  actorKind,
  linkedCharacterId,
  documentJson,
  updatedAt
}) {
  getDb()
    .prepare(
      `INSERT INTO encounter_actors (
         encounter_id, actor_id, sort_order, template_id, actor_kind,
         linked_character_id, document_json, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(encounter_id, actor_id) DO UPDATE SET
         sort_order = excluded.sort_order,
         template_id = excluded.template_id,
         actor_kind = excluded.actor_kind,
         linked_character_id = excluded.linked_character_id,
         document_json = excluded.document_json,
         updated_at = excluded.updated_at`
    )
    .run(
      encounterId,
      actorId,
      sortOrder,
      templateId,
      actorKind,
      linkedCharacterId,
      documentJson,
      updatedAt
    );
}

export function deleteEncounterActor(encounterId, actorId) {
  const info = getDb()
    .prepare(`DELETE FROM encounter_actors WHERE encounter_id = ? AND actor_id = ?`)
    .run(encounterId, actorId);
  return info.changes > 0;
}

export function countActorsWithTemplate(encounterId, templateId) {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS c FROM encounter_actors
       WHERE encounter_id = ? AND template_id = ?`
    )
    .get(encounterId, templateId);
  return row?.c ?? 0;
}

export function listCharacters(campaignId) {
  const rows = getDb()
    .prepare(
      `SELECT character_id, player_name, document_json, updated_at
       FROM characters WHERE campaign_id = ?
       ORDER BY updated_at DESC`
    )
    .all(campaignId);
  return rows.map((row) => ({
    characterId: row.character_id,
    playerName: row.player_name,
    updatedAt: row.updated_at,
    character: JSON.parse(row.document_json)
  }));
}

export function insertFeedback({
  id,
  createdAt,
  category,
  severity = null,
  area = null,
  role = null,
  title,
  message,
  appVersion = null,
  userAgent = null,
  status = 'open',
  contact = null
}) {
  getDb()
    .prepare(
      `INSERT INTO feedback (
         id, created_at, category, severity, area, role,
         title, message, app_version, user_agent, status, contact
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      createdAt,
      category,
      severity,
      area,
      role,
      title,
      message,
      appVersion,
      userAgent,
      status,
      contact
    );
}

function rowToFeedback(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    category: row.category,
    severity: row.severity,
    area: row.area,
    role: row.role,
    title: row.title,
    message: row.message,
    appVersion: row.app_version,
    userAgent: row.user_agent,
    status: row.status,
    contact: row.contact
  };
}

export function getFeedback(id) {
  const row = getDb().prepare(`SELECT * FROM feedback WHERE id = ?`).get(id);
  return row ? rowToFeedback(row) : null;
}

export function listFeedback({ category, status, limit = 200, offset = 0 } = {}) {
  const clauses = [];
  const params = [];
  if (category) {
    clauses.push('category = ?');
    params.push(category);
  }
  if (status) {
    clauses.push('status = ?');
    params.push(status);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 200));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const rows = getDb()
    .prepare(
      `SELECT * FROM feedback ${where}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, safeLimit, safeOffset);
  return rows.map(rowToFeedback);
}

export function getFeedbackStats() {
  const db = getDb();
  const total = db.prepare(`SELECT COUNT(*) AS c FROM feedback`).get().c;
  const byCategory = db
    .prepare(
      `SELECT category, COUNT(*) AS count FROM feedback
       GROUP BY category ORDER BY count DESC`
    )
    .all();
  const byStatus = db
    .prepare(
      `SELECT status, COUNT(*) AS count FROM feedback
       GROUP BY status ORDER BY count DESC`
    )
    .all();
  const byArea = db
    .prepare(
      `SELECT COALESCE(NULLIF(area, ''), 'unspecified') AS area, COUNT(*) AS count
       FROM feedback GROUP BY area ORDER BY count DESC`
    )
    .all();
  const topRecurring = db
    .prepare(
      `SELECT category, COALESCE(NULLIF(area, ''), 'unspecified') AS area, COUNT(*) AS count
       FROM feedback GROUP BY category, area ORDER BY count DESC LIMIT 10`
    )
    .all();
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const last30Days = db
    .prepare(`SELECT COUNT(*) AS c FROM feedback WHERE created_at >= ?`)
    .get(cutoff).c;
  return { total, last30Days, byCategory, byStatus, byArea, topRecurring };
}

export function updateFeedbackStatus(id, status) {
  const info = getDb()
    .prepare(`UPDATE feedback SET status = ? WHERE id = ?`)
    .run(status, id);
  return info.changes > 0;
}

export function deleteFeedback(id) {
  const info = getDb().prepare(`DELETE FROM feedback WHERE id = ?`).run(id);
  return info.changes > 0;
}
