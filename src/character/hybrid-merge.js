/**
 * Hybrid character combination (PH3:134-135).
 *
 * Merges two normalized class records (see CompendiumProvider.getNormalizedClass)
 * into the combined traits a hybrid character uses. Pure functions, no DOM/DB,
 * so they are unit-testable in isolation and reusable by the class step and the
 * sheet sync once wired in. See doc/bugs.md "Hybrid character rules (PH3)".
 *
 * @typedef {Object} NormalizedClass
 * @property {string} id
 * @property {string} [name]
 * @property {number|null} [hp_at1_base]
 * @property {number|null} [hp_per_level]
 * @property {number|null} [surges_base]
 * @property {number|null} [base_speed]
 * @property {number|null} [is_hybrid]
 * @property {string|null} [hybrid_parent_class_id]
 * @property {Array<{ skill_id: string, kind: string, choose_count?: number }>} [trainedSkills]
 * @property {Array<{ kind: string, value: string }>} [proficiencies]
 */

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function uniq(list) {
  return [...new Set(list)];
}

function normalizeProf(value) {
  return String(value ?? '').trim().toLowerCase();
}

/**
 * Group a class's proficiency rows by kind into normalized string sets.
 * @param {NormalizedClass} cls
 */
function profSetsByKind(cls) {
  /** @type {Record<string, Set<string>>} */
  const out = { armor: new Set(), weapon: new Set(), implement: new Set(), shield: new Set() };
  for (const p of cls?.proficiencies ?? []) {
    const kind = String(p.kind ?? '').toLowerCase();
    if (out[kind]) out[kind].add(normalizeProf(p.value));
  }
  return out;
}

function intersect(aSet, bSet) {
  return [...aSet].filter((v) => bSet.has(v));
}

function union(aSet, bSet) {
  return uniq([...aSet, ...bSet]);
}

/**
 * Whether two classes/subclasses may be hybridized together.
 * PH3: the two cannot be the same class, nor two subclasses of the same class
 * (detected here via a shared hybrid_parent_class_id).
 * @param {NormalizedClass} a
 * @param {NormalizedClass} b
 * @returns {{ ok: boolean, reason?: string }}
 */
export function hybridPairAllowed(a, b) {
  if (!a || !b) return { ok: false, reason: 'Two classes are required.' };
  if (a.id && a.id === b.id) return { ok: false, reason: 'The two hybrid classes must be different.' };
  const pa = a.hybrid_parent_class_id ?? null;
  const pb = b.hybrid_parent_class_id ?? null;
  if (pa && pb && pa === pb) {
    return { ok: false, reason: 'The two cannot be subclasses of the same class.' };
  }
  return { ok: true };
}

/**
 * Combine two normalized class records into hybrid traits (PH3).
 * @param {NormalizedClass} a
 * @param {NormalizedClass} b
 */
export function mergeHybridClasses(a, b) {
  if (!a || !b) return null;

  // HP at level 1: average of the two starting (class) HP, rounded down.
  // Constitution score is added once, downstream by computeMaxHp().
  const hpAt1Base = Math.floor((num(a.hp_at1_base) + num(b.hp_at1_base)) / 2);
  // HP per level: total of half of each, rounded down (= floor of the sum).
  const hpPerLevel = Math.floor(num(a.hp_per_level) / 2 + num(b.hp_per_level) / 2);
  // Healing surges/day: average rounded down, plus CON modifier once downstream.
  const surgesBase = Math.floor((num(a.surges_base) + num(b.surges_base)) / 2);
  // Speed: hybrid rules do not change speed; keep the lower of the two as a
  // safe default (both are usually equal).
  const baseSpeed = Math.min(num(a.base_speed) || Infinity, num(b.base_speed) || Infinity);

  // Skills: class skills of both combine; trained in any three of them.
  const skillPool = uniq([
    ...(a.trainedSkills ?? []).map((s) => s.skill_id),
    ...(b.trainedSkills ?? []).map((s) => s.skill_id)
  ]);

  const aProf = profSetsByKind(a);
  const bProf = profSetsByKind(b);
  const proficiencies = {
    // Armor and shields: only those common to both (intersection).
    armor: intersect(aProf.armor, bProf.armor),
    shield: intersect(aProf.shield, bProf.shield),
    // Weapons and implements: combined from both (union).
    weapon: union(aProf.weapon, bProf.weapon),
    implement: union(aProf.implement, bProf.implement)
  };

  return {
    classIds: [a.id, b.id],
    hpAt1Base,
    hpPerLevel,
    surgesBase,
    baseSpeed: Number.isFinite(baseSpeed) ? baseSpeed : null,
    trainedSkillPool: skillPool,
    trainedChooseCount: 3,
    proficiencies
  };
}

const POWER_TYPES = ['At-Will', 'Encounter', 'Daily', 'Utility'];

function matchesClass(powerClassName, className) {
  const p = String(powerClassName ?? '').trim().toLowerCase();
  const c = String(className ?? '').trim().toLowerCase();
  if (!p || !c) return false;
  return p === c || p.includes(c) || c.includes(p);
}

/**
 * Validate the PH3 hybrid power rule: you must hold one power of each type
 * (at-will, encounter attack, daily attack, utility) from BOTH classes before
 * taking a second power of one class.
 *
 * @param {Array<{ className?: string, powerType?: string }>} chosenPowers
 * @param {[string, string]} classNames the two hybrid class names
 * @returns {{ ok: boolean, missing: Array<{ className: string, types: string[] }> }}
 */
export function hybridPowerCoverage(chosenPowers, classNames) {
  const [nameA, nameB] = classNames ?? [];
  const counts = {
    [nameA]: { byType: new Map(), total: 0 },
    [nameB]: { byType: new Map(), total: 0 }
  };

  for (const p of chosenPowers ?? []) {
    for (const name of [nameA, nameB]) {
      if (matchesClass(p.className, name)) {
        const t = String(p.powerType ?? '');
        counts[name].byType.set(t, (counts[name].byType.get(t) ?? 0) + 1);
        counts[name].total += 1;
        break;
      }
    }
  }

  const missing = [];
  for (const name of [nameA, nameB]) {
    const lack = POWER_TYPES.filter((t) => !counts[name].byType.has(t));
    if (lack.length) missing.push({ className: name, types: lack });
  }

  // The rule only bites once someone tries to take a second power of a class;
  // we report coverage so the caller can gate that case.
  return { ok: missing.length === 0, missing };
}
