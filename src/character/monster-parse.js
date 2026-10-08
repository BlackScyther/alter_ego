/**
 * Parse iws.mx monster HTML into listing fields and combat stat blocks.
 */

function stripHtml(html) {
  return String(html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {string} text
 */
export function looksLikeMonsterStatLine(text) {
  const t = String(text ?? '').trim();
  if (!t) return false;
  if (/\b(HP|AC|Fortitude|Fort|Reflex|Ref|Will|Initiative|Init|Speed|Senses?|Perception|Insight|Immune|Resist|Vulnerable|Saving Throws?|Action Points?|Alignment|Languages?|Skills?|Equipment|XP|Recharge|Aura|Bloodied|Str|Dex|Con|Int|Wis|Cha)\b\s*[:\-]?\s*[+\-]?\d/i.test(t)) {
    return true;
  }
  if (/\bDC\s*\d/i.test(t)) return true;
  if (/\bvs\.?\s*(AC|Fortitude|Reflex|Will)\b/i.test(t)) return true;
  if (/\b(Level|level)\s+\d+\b/.test(t) && t.length < 60) return true;
  const digits = (t.match(/\d/g) || []).length;
  if (t.length && digits / t.length > 0.15) return true;
  return false;
}

/**
 * @param {string | number | null | undefined}
 */
function parseIntField(value) {
  if (value == null || value === '') return null;
  const m = String(value).match(/[+\-]?\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return Number.isNaN(n) ? null : n;
}

/**
 * @param {object | null | undefined} entry
 */
export function parseMonsterListing(entry) {
  const lf = entry?.listing_fields ?? {};
  return {
    id: entry?.id ?? null,
    name: lf.Name ?? entry?.id ?? null,
    level: parseIntField(lf.Level),
    combatRole: lf.CombatRole ?? null,
    groupRole: lf.GroupRole ?? null,
    size: lf.Size ?? null,
    creatureType: lf.CreatureType ?? lf.Type ?? null,
    sourceBook: lf.SourceBook ?? null
  };
}

/**
 * Parse the primary HP/AC/defenses stat line from monster body HTML.
 * @param {string} html
 */
export function parseMonsterStatLine(html) {
  const text = stripHtml(html);
  if (!text) return null;

  /** @type {Record<string, number | null>} */
  const stats = {
    hp: null,
    bloodiedHp: null,
    ac: null,
    fort: null,
    ref: null,
    will: null,
    initiative: null,
    speedSquares: null,
    perception: null,
    xp: null
  };

  const paragraphs = [];
  const pRe = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = pRe.exec(html ?? '')) !== null) {
    const t = stripHtml(m[1]);
    if (looksLikeMonsterStatLine(t)) paragraphs.push(t);
  }
  if (!paragraphs.length) {
    const flat = text;
    if (looksLikeMonsterStatLine(flat)) paragraphs.push(flat);
  }

  for (const line of paragraphs) {
    const hp = /HP\s+(\d+)/i.exec(line);
    if (hp) stats.hp = parseInt(hp[1], 10);

    const bloodied = /Bloodied\s+(\d+)/i.exec(line);
    if (bloodied) stats.bloodiedHp = parseInt(bloodied[1], 10);

    const ac = /\bAC\s+(\d+)/i.exec(line);
    if (ac) stats.ac = parseInt(ac[1], 10);

    const fort = /Fortitude\s+(\d+)/i.exec(line) || /\bFort\s+(\d+)/i.exec(line);
    if (fort) stats.fort = parseInt(fort[1], 10);

    const ref = /Reflex\s+(\d+)/i.exec(line) || /\bRef\s+(\d+)/i.exec(line);
    if (ref) stats.ref = parseInt(ref[1], 10);

    const will = /\bWill\s+(\d+)/i.exec(line);
    if (will) stats.will = parseInt(will[1], 10);

    const init = /Initiative\s*([+\-]?\d+)/i.exec(line) || /\bInit\s*([+\-]?\d+)/i.exec(line);
    if (init) stats.initiative = parseInt(init[1], 10);

    const speed = /Speed\s+(\d+)/i.exec(line);
    if (speed) stats.speedSquares = parseInt(speed[1], 10);

    const perc = /Perception\s*([+\-]?\d+)/i.exec(line);
    if (perc) stats.perception = parseInt(perc[1], 10);

    const xp = /\bXP\s+(\d+)/i.exec(line);
    if (xp) stats.xp = parseInt(xp[1], 10);

    if (stats.hp != null && stats.ac != null && stats.initiative != null) break;
  }

  const hasAny = Object.values(stats).some((v) => v != null);
  return hasAny ? stats : null;
}

/**
 * @param {object | null | undefined} entry
 */
export function parseMonsterCombatStats(entry) {
  const lf = entry?.listing_fields ?? {};
  const fromListing = {
    hp: parseIntField(lf.HP),
    bloodiedHp: null,
    ac: parseIntField(lf.AC),
    fort: parseIntField(lf.Fort),
    ref: parseIntField(lf.Ref),
    will: parseIntField(lf.Will),
    initiative: parseIntField(lf.Initiative),
    speedSquares: parseIntField(lf.Speed),
    perception: parseIntField(lf.Perception),
    xp: parseIntField(lf.XP)
  };
  const fromBody = parseMonsterStatLine(entry?.body_html ?? '') ?? {};

  return {
    hp: fromListing.hp ?? fromBody.hp ?? null,
    bloodiedHp: fromBody.bloodiedHp ?? null,
    ac: fromListing.ac ?? fromBody.ac ?? null,
    fort: fromListing.fort ?? fromBody.fort ?? null,
    ref: fromListing.ref ?? fromBody.ref ?? null,
    will: fromListing.will ?? fromBody.will ?? null,
    initiative: fromListing.initiative ?? fromBody.initiative ?? null,
    speedSquares: fromListing.speedSquares ?? fromBody.speedSquares ?? null,
    perception: fromListing.perception ?? fromBody.perception ?? null,
    xp: fromListing.xp ?? fromBody.xp ?? null
  };
}

const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const ABILITY_LABELS = {
  str: /strength|str\b/i,
  dex: /dexterity|dex\b/i,
  con: /constitution|con\b/i,
  int: /intelligence|int\b/i,
  wis: /wisdom|wis\b/i,
  cha: /charisma|cha\b/i
};

/**
 * Parse ability scores from monster HTML tables or inline Str/Dex lines.
 * @param {string} html
 */
export function parseMonsterAbilities(html) {
  const text = stripHtml(html);
  /** @type {Record<string, number | null>} */
  const scores = {};
  for (const key of ABILITY_KEYS) scores[key] = null;

  const inline = /\b(Str|Dex|Con|Int|Wis|Cha)\s+(\d+)\b/gi;
  let m;
  while ((m = inline.exec(text)) !== null) {
    const key = m[1].toLowerCase();
    if (ABILITY_KEYS.includes(key)) scores[key] = parseInt(m[2], 10);
  }

  return scores;
}

/**
 * @param {string} html
 */
export function parseMonsterResistances(html) {
  const text = stripHtml(html);
  /** @type {Array<{ damageType: string, amount: number | null }>} */
  const out = [];
  const resistRe = /Resist\s+(\d+)\s+(\w+)/gi;
  let m;
  while ((m = resistRe.exec(text)) !== null) {
    out.push({ damageType: m[2].toLowerCase(), amount: parseInt(m[1], 10) });
  }
  const immuneRe = /Immune\s+([\w\s,]+)/gi;
  while ((m = immuneRe.exec(text)) !== null) {
    for (const part of m[1].split(/[,\s]+/)) {
      const t = part.trim().toLowerCase();
      if (t) out.push({ damageType: t, amount: null, immunity: true });
    }
  }
  const vulnRe = /Vulnerable\s+(\d+)\s+(\w+)/gi;
  while ((m = vulnRe.exec(text)) !== null) {
    out.push({ damageType: m[2].toLowerCase(), amount: parseInt(m[1], 10), vulnerability: true });
  }
  return out;
}

/**
 * @param {string} html
 */
export function parseMonsterSkills(html) {
  const text = stripHtml(html);
  const block = /Skills?\s+([^.]+)/i.exec(text)?.[1];
  if (!block) return [];
  /** @type {Array<{ skill: string, bonus: number }>} */
  const out = [];
  const re = /([A-Za-z]+)\s*([+\-]?\d+)/g;
  let m;
  while ((m = re.exec(block)) !== null) {
    out.push({ skill: m[1].toLowerCase(), bonus: parseInt(m[2], 10) });
  }
  return out;
}

/**
 * @param {string} html
 */
export function parseMonsterPowers(html) {
  const body = String(html ?? '');
  /** @type {Array<{ name: string, usage: string | null, action: string | null, attackLine: string | null, hit: string | null, effect: string | null }>} */
  const powers = [];
  const blocks = body.split(/<h1\b[^>]*class\s*=\s*[^>]*power[^>]*>/gi);
  for (let i = 1; i < blocks.length; i++) {
    const chunk = blocks[i];
    const nameEnd = chunk.indexOf('</h1>');
    const name = stripHtml(nameEnd >= 0 ? chunk.slice(0, nameEnd) : chunk.split(/</)[0]);
    const rest = stripHtml(nameEnd >= 0 ? chunk.slice(nameEnd) : chunk).slice(0, 500);
    if (!name) continue;
    const usage = /(at-will|encounter|daily)/i.exec(rest)?.[1] ?? null;
    const action = /(standard|move|minor|free|immediate|opportunity)\s+action/i.exec(rest)?.[1] ?? null;
    const attack = /Attack:\s*([^.]+)/i.exec(rest)?.[1]?.trim() ?? null;
    const hit = /Hit:\s*([^.]+)/i.exec(rest)?.[1]?.trim() ?? null;
    const effect = /Effect:\s*([^.]+)/i.exec(rest)?.[1]?.trim() ?? null;
    powers.push({ name, usage, action, attackLine: attack, hit, effect });
  }
  return powers;
}

/**
 * @param {string} html
 */
export function parseMonsterTraits(html) {
  const text = stripHtml(html);
  /** @type {Array<{ name: string, traitType: string | null, text: string }>} */
  const traits = [];
  const auraRe = /(Aura\s+\d+[^.]*)/gi;
  let m;
  while ((m = auraRe.exec(text)) !== null) {
    traits.push({ name: m[1].trim(), traitType: 'aura', text: m[1].trim() });
  }
  return traits;
}

/**
 * Resolve spawn-ready combat stats with fallbacks for level.
 * @param {object} entry
 * @param {object | null} [normalized]
 */
export function resolveMonsterSpawnStats(entry, normalized = null) {
  const fields = entry?.listing_fields ?? {};
  const level = Math.min(30, Math.max(1, Number(fields.Level) || 1));
  const parsed = normalized ?? parseMonsterCombatStats(entry);
  const hpMax = Math.max(1, parsed.hp ?? level * 8 + 10);
  const ac = parsed.ac ?? 10 + Math.floor(level / 2);
  return {
    hp: hpMax,
    bloodiedHp: parsed.bloodiedHp,
    ac,
    fort: parsed.fort ?? ac - 2,
    ref: parsed.ref ?? ac - 2,
    will: parsed.will ?? ac - 2,
    initiative: parsed.initiative ?? 0,
    speedSquares: parsed.speedSquares,
    perception: parsed.perception,
    xp: parsed.xp
  };
}
