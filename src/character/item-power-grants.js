/**
 * Powers granted by inventory items, equipped or not.
 *
 * A grant exists when the item body links a power entry (`power123`), or when
 * it prints the power inline. Two inline shapes are common:
 * - Hungry Spear: `<h2 class=mihead>Power ✦ Encounter (Standard Action)</h2>…`
 *   The power has no name of its own, so the card uses the item name.
 * - Hand of Salzacas: `<h1 class=dailypower>Hand of Salzacas</h1>` plus the
 *   powerstat lines. The card keeps that printed name.
 *
 * Those inline powers are stored in `item_power` by the normalizer. They are
 * not copied into `power`, so the power search never lists them.
 */

import { normalizePowerType } from '../editor/power-filter.js';
import { EQUIPMENT_SLOTS } from './equipment-selections.js';

const SLOT_LABEL = Object.fromEntries(EQUIPMENT_SLOTS.map((slot) => [slot.id, slot.label]));

const USAGE_WORDS = new Set([
  'at-will',
  'at will',
  'encounter',
  'daily',
  'utility',
  'consumable',
  'weekly',
  'monthly',
  'healing surge'
]);

const SPECIAL_USAGE = [
  ['healing surge', 'Healing Surge'],
  ['consumable', 'Consumable'],
  ['monthly', 'Monthly'],
  ['weekly', 'Weekly']
];

const KIND_USAGE = [
  ['at-will', 'At-Will'],
  ['at will', 'At-Will'],
  ['encounter', 'Encounter'],
  ['daily', 'Daily'],
  ['utility', 'Utility']
];

const ACTION_RE =
  /\b(standard action|move action|minor action|free action|immediate interrupt|immediate reaction|no action|opportunity action)\b/i;

const ACTION_LABEL = {
  'standard action': 'Standard Action',
  'move action': 'Move Action',
  'minor action': 'Minor Action',
  'free action': 'Free Action',
  'immediate interrupt': 'Immediate Interrupt',
  'immediate reaction': 'Immediate Reaction',
  'no action': 'No Action',
  'opportunity action': 'Opportunity Action'
};

/**
 * @param {string} html
 * @returns {string[]}
 */
export function extractPowerIdsFromItemHtml(html) {
  const ids = new Set();
  const re = /\b(power\d+)\b/gi;
  let match;
  while ((match = re.exec(html ?? '')) !== null) {
    ids.add(match[1].toLowerCase());
  }
  return [...ids];
}

/**
 * Closest usage word before a power id, for items whose linked power has no Type.
 * @param {string} html
 * @param {string} powerId
 * @returns {'At-Will' | 'Encounter' | 'Daily' | 'Utility' | null}
 */
export function usageNearPowerMention(html, powerId) {
  const idx = String(html ?? '').toLowerCase().indexOf(String(powerId).toLowerCase());
  if (idx < 0) return null;
  const slice = String(html)
    .slice(Math.max(0, idx - 180), idx)
    .replace(/<[^>]+>/g, ' ')
    .toLowerCase();
  const marks = [
    ['utility', 'Utility'],
    ['at-will', 'At-Will'],
    ['at will', 'At-Will'],
    ['encounter', 'Encounter'],
    ['daily', 'Daily']
  ];
  let best = null;
  let bestAt = -1;
  for (const [needle, type] of marks) {
    const at = slice.lastIndexOf(needle);
    if (at > bestAt) {
      bestAt = at;
      best = type;
    }
  }
  return best;
}

/**
 * Usage printed on an item power. Consumable, Weekly, Monthly, and Healing
 * Surge stay intact. A heading that also names a kind, such as Consumable
 * Utility, keeps both instead of collapsing to Utility.
 * @param {string} text
 * @returns {string | null}
 */
export function parseItemPowerUsage(text) {
  const lower = String(text ?? '').toLowerCase();
  let special = null;
  let kind = null;
  for (const [needle, label] of SPECIAL_USAGE) {
    if (lower.includes(needle)) {
      special = label;
      break;
    }
  }
  for (const [needle, label] of KIND_USAGE) {
    if (lower.includes(needle)) {
      kind = label;
      break;
    }
  }
  if (special && kind) return `${special} ${kind}`;
  return special || kind || null;
}

/**
 * @param {string} text
 * @returns {string}
 */
function actionFromText(text) {
  const match = String(text ?? '').match(ACTION_RE);
  return match ? ACTION_LABEL[match[1].toLowerCase()] || '' : '';
}

/**
 * @param {string} text
 * @returns {string}
 */
function keywordFromHeading(text) {
  const parens = [...String(text ?? '').matchAll(/\(([^)]+)\)/g)];
  for (const paren of parens) {
    const inner = paren[1].replace(/\s+/g, ' ').trim();
    if (!inner || actionFromText(inner)) continue;
    if (USAGE_WORDS.has(inner.toLowerCase())) continue;
    if (parseItemPowerUsage(inner) === inner) continue;
    return inner;
  }
  return '';
}

/**
 * @param {string} headingText
 * @returns {{ usage: string | null, keyword: string, action: string }}
 */
export function parseItemPowerHeading(headingText) {
  const text = String(headingText ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!/^Power\b/i.test(text)) {
    return { usage: null, keyword: '', action: '' };
  }
  return {
    usage: parseItemPowerUsage(text),
    keyword: keywordFromHeading(text),
    action: actionFromText(text)
  };
}

/**
 * @param {string} attrs
 */
function headingClass(attrs) {
  const match = String(attrs ?? '').match(/class\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
  return (match?.[1] || match?.[2] || match?.[3] || '').toLowerCase();
}

/**
 * @param {string} tag
 * @param {string} attrs
 */
function isNamedPowerCard(tag, attrs) {
  if (String(tag) !== '1') return false;
  const cls = headingClass(attrs);
  if (!cls || cls.includes('mihead')) return false;
  return cls.split(/\s+/).some((token) => token.includes('power'));
}

/**
 * @param {string} attrs
 * @returns {string | null}
 */
function usageFromPowerClass(attrs) {
  const cls = headingClass(attrs);
  if (cls.includes('atwill') || cls.includes('at-will')) return 'At-Will';
  if (cls.includes('encounter')) return 'Encounter';
  if (cls.includes('daily')) return 'Daily';
  if (cls.includes('utility')) return 'Utility';
  return null;
}

/**
 * @param {string} bodyHtml
 * @returns {string | null}
 */
function usageFromPowerstat(bodyHtml) {
  const match = String(bodyHtml ?? '').match(/<p\b[^>]*class\s*=\s*["']?powerstat[^>]*>([\s\S]*?)<\/p>/i);
  if (!match) return null;
  const text = match[1].replace(/<[^>]+>/g, ' ');
  return parseItemPowerUsage(text);
}

/**
 * Keyword after the diamond on a powerstat line, such as Healing.
 * @param {string} bodyHtml
 * @returns {string}
 */
function keywordFromPowerstat(bodyHtml) {
  const match = String(bodyHtml ?? '').match(/✦\s*(?:<b>\s*)?([^<]+)/i);
  if (!match) return '';
  const text = match[1].replace(/<\/b>/gi, ' ').replace(/\s+/g, ' ').trim();
  if (!text || actionFromText(text) || parseItemPowerUsage(text)) return '';
  return text;
}

/**
 * Card title with the level span removed.
 * @param {string} innerHtml
 * @returns {string}
 */
function powerCardName(innerHtml) {
  const stripped = String(innerHtml ?? '').replace(/<span\b[^>]*>[\s\S]*?<\/span>/gi, ' ');
  const text = stripped.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text || /^Power\b/i.test(text)) return '';
  return text;
}

/**
 * A block whose text is only a `power123` link is a real power entry.
 * @param {string} headingText
 * @param {string} bodyHtml
 */
function blockIsOnlyPowerLink(headingText, bodyHtml) {
  const blob = `${headingText} ${bodyHtml}`;
  if (!/\bpower\d+\b/i.test(blob)) return false;
  const bodyText = String(bodyHtml)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\bpower\d+\b/gi, ' ')
    .replace(/[^\w]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return bodyText.length < 8;
}

/**
 * @param {string} html
 */
function slicePowerBody(html) {
  const endAt = String(html ?? '').search(/<h1\b|<h2\b|<p\s+class=["']?publishedIn/i);
  const body = (endAt >= 0 ? html.slice(0, endAt) : html).trim();
  return body.replace(/(?:<br\s*\/?\s*>|\s)+$/gi, '').trim();
}

/**
 * @param {string} headingText
 * @param {string} bodyHtml
 * @param {string} attrs
 * @param {boolean} namedCard
 */
function pushInlinePower(results, headingText, bodyHtml, attrs, namedCard) {
  if (blockIsOnlyPowerLink(headingText, bodyHtml)) return;
  const parsed = parseItemPowerHeading(headingText);
  const usage = parsed.usage || usageFromPowerstat(bodyHtml) || (namedCard ? usageFromPowerClass(attrs) : null);
  const keyword = parsed.keyword || (namedCard ? keywordFromPowerstat(bodyHtml) : '');
  const action = parsed.action || actionFromText(bodyHtml);
  const name = namedCard ? powerCardName(headingText) : '';
  if (!namedCard && !/^Power\b/i.test(headingText.replace(/<[^>]+>/g, ' '))) return;
  if (namedCard && !name && !usage) return;
  const plainHeading = headingText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  results.push({
    index: results.length,
    usage,
    keyword,
    action,
    name,
    heading: name || plainHeading,
    bodyHtml
  });
}

/**
 * Inline powers from an item body, in document order.
 * A `Power` heading with no usage is still returned so the normalizer can warn.
 * A block that only links `power123` is skipped.
 *
 * @param {string} html
 * @returns {Array<{
 *   index: number,
 *   usage: string | null,
 *   keyword: string,
 *   action: string,
 *   name: string,
 *   heading: string,
 *   bodyHtml: string
 * }>}
 */
export function extractInlineItemPowers(html) {
  const s = String(html ?? '');
  /** @type {ReturnType<typeof extractInlineItemPowers>} */
  const results = [];

  const headingRe = /<h([12])\b([^>]*)>([\s\S]*?)<\/h\1>/gi;
  let match;
  while ((match = headingRe.exec(s)) !== null) {
    const tag = match[1];
    const attrs = match[2] || '';
    const namedCard = isNamedPowerCard(tag, attrs);
    const headingText = match[3].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const powerHeading = tag === '2' && /^Power\b/i.test(headingText);
    if (!namedCard && !powerHeading) continue;
    const bodyHtml = slicePowerBody(s.slice(match.index + match[0].length));
    pushInlinePower(results, namedCard ? match[3] : headingText, bodyHtml, attrs, namedCard);
  }

  if (results.length) return results;

  // Fallback: <b>Power (Daily):</b> … in a mistat paragraph.
  // Skip blocks that already link a powerN id — those are collected separately.
  const boldRe = /<b>\s*(Power\b[^<]*)<\/b>/gi;
  while ((match = boldRe.exec(s)) !== null) {
    const headingText = match[1].replace(/\s+/g, ' ').trim();
    const { usage, keyword, action } = parseItemPowerHeading(headingText);
    const start = match.index + match[0].length;
    const rest = s.slice(start);
    const endAt = rest.search(/<\/p>|<b>\s*Power\b|<h[12]\b|<p\s+class=["']?publishedIn/i);
    const bodyHtml = (endAt >= 0 ? rest.slice(0, endAt) : rest).trim();
    if (blockIsOnlyPowerLink(headingText, bodyHtml) || /\bpower\d+\b/i.test(`${match[0]} ${bodyHtml}`)) {
      continue;
    }
    results.push({
      index: results.length,
      usage,
      keyword,
      action,
      name: '',
      heading: headingText,
      bodyHtml
    });
  }

  return results;
}

/**
 * Stable id for an inline item power (not a compendium power row).
 * @param {string} itemId
 * @param {number} index
 */
export function inlineItemPowerId(itemId, index) {
  return `${String(itemId).toLowerCase()}#item-power-${index}`;
}

/**
 * A printed card name wins. Otherwise the item name is the power name.
 * A keyword, or a second power on the same item, is added in parentheses.
 * @param {string} itemName
 * @param {{ name?: string, keyword?: string, usage?: string | null }} power
 * @param {number} totalInline
 */
export function itemPowerDisplayName(itemName, power, totalInline) {
  if (power?.name) return power.name;
  const base = itemName || 'Item power';
  if (power?.keyword) return `${base} (${power.keyword})`;
  if (totalInline > 1 && power?.usage) return `${base} (${power.usage})`;
  return base;
}

/**
 * Rows for the `item_power` table. Source book comes from the item entry.
 * @param {{ id?: string, listing_fields?: Record<string, string>, body_html?: string }} entry
 */
export function itemPowerRowsFromEntry(entry) {
  const powers = extractInlineItemPowers(entry?.body_html ?? '');
  const itemId = String(entry?.id ?? '').toLowerCase();
  const itemName = entry?.listing_fields?.Name || itemId || 'Item';
  const sourceBook = entry?.listing_fields?.SourceBook || null;
  return powers.map((power) => ({
    id: inlineItemPowerId(itemId, power.index),
    itemId,
    sortIndex: power.index,
    name: itemPowerDisplayName(itemName, power, powers.length),
    powerType: power.usage,
    action: power.action || null,
    keyword: power.keyword || null,
    sourceBook,
    bodyHtml: power.bodyHtml || '',
    heading: power.heading || ''
  }));
}

/**
 * @param {Array<Record<string, unknown>>} rows
 */
function storedRowsToInline(rows) {
  return rows.map((row) => ({
    index: Number(row.sort_index ?? 0),
    usage: row.power_type ? String(row.power_type) : null,
    keyword: row.keyword ? String(row.keyword) : '',
    action: row.action ? String(row.action) : '',
    name: row.name ? String(row.name) : '',
    heading: '',
    bodyHtml: row.body_html ? String(row.body_html) : '',
    sourceBook: row.source_book ? String(row.source_book) : ''
  }));
}

/**
 * @param {object} character
 * @param {{ getEntry: (id: string) => Promise<object | null | undefined> }} compendium
 */
export async function collectItemPowerGrants(character, compendium) {
  const owned = (character?.selections?.equipmentItems ?? []).filter((item) => item?.compendiumId);
  /** @type {Map<string, object | null>} */
  const cache = new Map();

  async function entryFor(id) {
    const key = String(id).toLowerCase();
    if (cache.has(key)) return cache.get(key);
    const value = (await compendium.getEntry(id)) ?? null;
    cache.set(key, value);
    return value;
  }

  /**
   * @type {Array<{
   *   itemId: string,
   *   itemName: string,
   *   slotId: string,
   *   slotLabel: string,
   *   powerId: string,
   *   powerName: string,
   *   usage: string | null,
   *   action: string,
   *   sourceBook: string,
   *   linkId: string,
   *   inline: boolean,
   *   bodyHtml?: string
   * }>}
   */
  const grants = [];
  const seen = new Set();

  for (const item of owned) {
    const itemEntry = await entryFor(item.compendiumId);
    const itemId = String(item.compendiumId).toLowerCase();
    const itemName = itemEntry?.listing_fields?.Name || itemId;
    const html = itemEntry?.body_html ?? '';
    const sourceBook = itemEntry?.listing_fields?.SourceBook || '';

    for (const powerId of extractPowerIdsFromItemHtml(html)) {
      const key = `${item.instanceId ?? itemId}|${powerId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const powerEntry = await entryFor(powerId);
      if (powerEntry?.category_slug && powerEntry.category_slug !== 'power') continue;
      const usage =
        normalizePowerType(powerEntry?.listing_fields?.Type) ?? usageNearPowerMention(html, powerId);
      grants.push({
        itemId,
        itemName,
        slotId: item.slotId,
        slotLabel: SLOT_LABEL[item.slotId] || item.slotId,
        powerId,
        powerName: powerEntry?.listing_fields?.Name || powerId,
        usage,
        action: '',
        sourceBook: powerEntry?.listing_fields?.SourceBook || '',
        linkId: powerId,
        inline: false
      });
    }

    let inlinePowers = null;
    if (typeof compendium.listItemPowers === 'function') {
      const stored = await compendium.listItemPowers(item.compendiumId);
      if (Array.isArray(stored)) inlinePowers = storedRowsToInline(stored);
    }
    if (!inlinePowers) inlinePowers = extractInlineItemPowers(html);

    for (const power of inlinePowers) {
      const powerId = inlineItemPowerId(itemId, power.index);
      const key = `${item.instanceId ?? itemId}|${powerId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      grants.push({
        itemId,
        itemName,
        slotId: item.slotId,
        slotLabel: SLOT_LABEL[item.slotId] || item.slotId,
        powerId,
        powerName: itemPowerDisplayName(itemName, power, inlinePowers.length),
        usage: power.usage,
        action: power.action || '',
        sourceBook: power.sourceBook || sourceBook,
        linkId: itemId,
        inline: true,
        bodyHtml: power.bodyHtml
      });
    }
  }

  return grants;
}
