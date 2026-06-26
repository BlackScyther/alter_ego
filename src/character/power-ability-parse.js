/**
 * Detect racial (and other) powers that let the player choose which ability
 * score the power uses for its attack, e.g.
 *   "Attack: Strength, Dexterity, or Constitution vs. AC".
 *
 * The available options are a property of the power entry (parsed once at build
 * time into `power_ability_option`). The actual pick is a per-character
 * selection (`selections.racePowerAbilityChoices`) and is never stored here.
 */

const ABILITY_WORD_TO_KEY = {
  strength: 'str',
  constitution: 'con',
  dexterity: 'dex',
  intelligence: 'int',
  wisdom: 'wis',
  charisma: 'cha'
};

function stripTags(html) {
  return String(html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const DAMAGE_TYPE_WORDS = [
  'acid',
  'cold',
  'fire',
  'lightning',
  'poison',
  'necrotic',
  'radiant',
  'psychic',
  'thunder',
  'force'
];

/** Collect distinct ability keys (in text order) from a text segment. */
function abilityKeysIn(seg) {
  /** @type {string[]} */
  const keys = [];
  const wordRe = /\b(strength|constitution|dexterity|intelligence|wisdom|charisma)\b/gi;
  let w;
  while ((w = wordRe.exec(String(seg ?? ''))) !== null) {
    const key = ABILITY_WORD_TO_KEY[w[1].toLowerCase()];
    if (key && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

/**
 * @param {string | { id?: string, body_html?: string } | null | undefined} source
 * @returns {{ choiceGroup: string, options: Array<{ ability: string, role: string }> } | null}
 */
export function parsePowerAbilityOptions(source) {
  const entry = typeof source === 'object' && source ? source : null;
  const html = typeof source === 'string' ? source : source?.body_html ?? '';
  const id = String(entry?.id ?? 'power').toLowerCase();
  const text = stripTags(html);
  if (!text) return null;

  const build = (keys) => ({
    choiceGroup: `${id}-attack`,
    options: keys.map((ability) => ({ ability, role: 'attack' }))
  });

  // 1) Attack line: between "Attack:" and the "vs." defense, so a damage ability
  // in a later "Hit:" clause is not mistaken for a choice.
  const attackRe = /\bAttack\s*:?\s*([^.;]*?)\bvs\.?/gi;
  let m;
  while ((m = attackRe.exec(text)) !== null) {
    const keys = abilityKeysIn(m[1] ?? '');
    if (keys.length >= 2) return build(keys);
  }

  // 2) "Special:" phrasing, e.g. Dragon Breath: "choose Strength, Constitution,
  // or Dexterity as the ability score you use when making attack rolls".
  const specialRe =
    /\bchoose\s+([^.]*?)\s+as\s+the\s+ability\s+score\s+you\s+use\s+when\s+making\s+attack\s+rolls/gi;
  while ((m = specialRe.exec(text)) !== null) {
    const keys = abilityKeysIn(m[1] ?? '');
    if (keys.length >= 2) return build(keys);
  }

  return null;
}

/**
 * Detect powers that let the player choose the power's damage type, e.g.
 * "you also choose the power's damage type: acid, cold, fire, lightning, or
 * poison". Returns the offered damage types (>= 2) or null.
 * @param {string | { id?: string, body_html?: string } | null | undefined} source
 * @returns {{ choiceGroup: string, options: Array<{ damageType: string }> } | null}
 */
export function parsePowerDamageOptions(source) {
  const entry = typeof source === 'object' && source ? source : null;
  const html = typeof source === 'string' ? source : source?.body_html ?? '';
  const id = String(entry?.id ?? 'power').toLowerCase();
  const text = stripTags(html);
  if (!text) return null;

  // Look at the clause after "damage type" so a damage keyword elsewhere in the
  // power text (e.g. "fire damage" in an effect) is not mistaken for a choice.
  const re = /damage\s+type\b[^.]*/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const seg = m[0] ?? '';
    /** @type {string[]} */
    const types = [];
    const wordRe = new RegExp(`\\b(${DAMAGE_TYPE_WORDS.join('|')})\\b`, 'gi');
    let w;
    while ((w = wordRe.exec(seg)) !== null) {
      const t = w[1].toLowerCase();
      if (!types.includes(t)) types.push(t);
    }
    if (types.length >= 2) {
      return {
        choiceGroup: `${id}-damage`,
        options: types.map((damageType) => ({ damageType }))
      };
    }
  }
  return null;
}

export { ABILITY_WORD_TO_KEY, DAMAGE_TYPE_WORDS };
