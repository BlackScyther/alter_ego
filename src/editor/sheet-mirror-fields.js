/**
 * Field manifest for the persistent character-sheet mirror (page 1).
 * Each field: { id, label, type, readonly?, wizardReadonly? }
 */

import { SKILLS } from '../formulas.js';

const ABILITIES = ['str', 'con', 'dex', 'int', 'wis', 'cha'];
const ABIL_LABELS = { str: 'STR', con: 'CON', dex: 'DEX', int: 'INT', wis: 'WIS', cha: 'CHA' };
const DEFENSES = [
  { id: 'ac', label: 'AC', parts: ['abil', 'class', 'feat', 'enh', 'misc', 'armor'] },
  { id: 'fort', label: 'FORT', parts: ['abil', 'class', 'feat', 'enh', 'misc'] },
  { id: 'ref', label: 'REF', parts: ['abil', 'class', 'feat', 'enh', 'misc'] },
  { id: 'will', label: 'WILL', parts: ['abil', 'class', 'feat', 'enh', 'misc'] }
];
const ATTACK_KINDS = ['melee', 'ranged'];

function field(id, label, type = 'text', opts = {}) {
  return {
    id,
    label,
    type,
    readonly: Boolean(opts.readonly),
    wizardReadonly: Boolean(opts.wizardReadonly),
    total: Boolean(opts.total),
    row: opts.row ?? null
  };
}

function identityFields() {
  return [
    field('player-name', 'Player Name'),
    field('character-name', 'Character Name'),
    field('level', 'Level', 'number'),
    field('class', 'Class', 'text', { wizardReadonly: true }),
    field('paragon-path', 'Paragon Path'),
    field('epic-destiny', 'Epic Destiny'),
    field('race', 'Race', 'text', { wizardReadonly: true }),
    field('size', 'Size'),
    field('age', 'Age'),
    field('gender', 'Gender'),
    field('height', 'Height'),
    field('weight', 'Weight'),
    field('alignment', 'Alignment'),
    field('deity', 'Deity'),
    field('company', 'Adventuring Company'),
    field('total-xp', 'Total XP', 'number')
  ];
}

function initiativeFields() {
  return [
    field('init-total', 'Initiative', 'number', { readonly: true, total: true }),
    field('init-dex', 'Initiative — DEX', 'number', { readonly: true }),
    field('init-half', 'Initiative — ½ Lvl', 'number', { readonly: true }),
    field('init-misc', 'Initiative — Misc', 'number'),
    field('init-misc-derived', 'Initiative — Features', 'number', { readonly: true, wizardReadonly: true }),
    field('init-conditional', 'Conditional Modifiers', 'textarea')
  ];
}

function abilityFields() {
  const out = [];
  for (const ab of ABILITIES) {
    const label = ABIL_LABELS[ab];
    out.push(field(`${ab}-score`, `${label} Score`, 'number', { wizardReadonly: true, row: ab }));
    out.push(field(`${ab}-mod`, `${label} Abil Mod`, 'number', { readonly: true, row: ab }));
    out.push(field(`${ab}-mod-half`, `${label} Mod + ½ Lvl`, 'number', { readonly: true, row: ab }));
  }
  return out;
}

function hitPointFields() {
  return [
    field('max-hp', 'Max HP', 'number', { readonly: true, total: true }),
    field('bloodied', 'Bloodied (½ HP)', 'number', { readonly: true }),
    field('surge-value', 'Surge Value (¼ HP)', 'number', { readonly: true }),
    field('surges-day', 'Healing Surges/Day', 'number'),
    field('surge-uses', 'Current Surge Uses', 'number'),
    field('current-hp', 'Current Hit Points', 'number'),
    field('temp-hp', 'Temporary Hit Points', 'number'),
    field('second-wind', 'Second Wind — Used', 'checkbox'),
    field('death-fail-1', 'Death Save Failure 1', 'checkbox'),
    field('death-fail-2', 'Death Save Failure 2', 'checkbox'),
    field('death-fail-3', 'Death Save Failure 3', 'checkbox'),
    field('save-mods', 'Saving Throw Mods'),
    field('resistances', 'Resistances', 'textarea'),
    field('conditions', 'Current Conditions and Effects', 'textarea')
  ];
}

function skillFields() {
  const out = [field('armor-penalty-global', 'Global Armor Penalty', 'number')];
  for (const skill of SKILLS) {
    out.push(field(`skill-${skill.id}-bonus`, `${skill.name} — Bonus`, 'number', { readonly: true }));
    out.push(field(`skill-${skill.id}-mod-half`, `${skill.name} — Abil Mod + ½ Lvl`, 'number', { readonly: true }));
    out.push(field(`skill-${skill.id}-trained`, `${skill.name} — Trained (+5)`, 'checkbox'));
    if (skill.armorPenalty) {
      out.push(field(`skill-${skill.id}-pen`, `${skill.name} — Armor Penalty`, 'number'));
    }
    out.push(field(`skill-${skill.id}-misc`, `${skill.name} — Misc`, 'number', { wizardReadonly: true }));
  }
  return out;
}

function defenseFields() {
  const out = [];
  for (const def of DEFENSES) {
    out.push(field(`${def.id}-total`, `${def.label} Total`, 'number', { readonly: true, total: true, row: def.id }));
    out.push(field(`${def.id}-ten`, `${def.label} — 10+`, 'number', { readonly: true, row: def.id }));
    out.push(field(`${def.id}-half`, `${def.label} — ½ Lvl`, 'number', { readonly: true, row: def.id }));
    for (const part of def.parts) {
      const partLabel = part === 'abil' ? 'ABIL' : part.toUpperCase();
      out.push(
        field(`${def.id}-${part}`, `${def.label} — ${partLabel}`, 'number', {
          row: def.id,
          readonly: part === 'abil'
        })
      );
    }
    out.push(field(`${def.id}-conditional`, `${def.label} — Conditional Bonuses`, 'textarea', { row: def.id }));
  }
  return out;
}

function actionPointFields() {
  return [
    field('action-points-total', 'Action Points', 'number', { readonly: true, total: true }),
    field('milestones', 'Milestones (0–2)', 'number'),
    field('ap-effects', 'Additional Effects for Spending Action Points', 'textarea')
  ];
}

function traitFields() {
  return [
    field('race-features', 'Race Features', 'textarea'),
    field('racial-powers', 'Racial Powers', 'textarea'),
    field('background-features', 'Background Features', 'textarea'),
    field('class-features', 'Class / Path / Destiny Features', 'textarea'),
    field('languages', 'Languages Known', 'textarea')
  ];
}

function collectionFields() {
  return [
    field('feats', 'Feats', 'textarea'),
    field('class-powers', 'Class Powers', 'textarea'),
    field('rituals', 'Rituals Known', 'textarea')
  ];
}

function movementFields() {
  return [
    field('speed-total', 'Speed (Squares)', 'number', { readonly: true, total: true }),
    field('speed-base', 'Speed — Base', 'number'),
    field('speed-armor', 'Speed — Armor', 'number'),
    field('speed-item', 'Speed — Item', 'number'),
    field('speed-misc', 'Speed — Misc', 'number'),
    field('special-movement', 'Special Movement', 'textarea')
  ];
}

function senseFields() {
  return [
    field('passive-insight', 'Passive Insight', 'number', { readonly: true, total: true }),
    field('passive-perception', 'Passive Perception', 'number', { readonly: true, total: true }),
    field('special-senses', 'Special Senses', 'textarea')
  ];
}

function attackFields() {
  const out = [];
  for (const kind of ATTACK_KINDS) {
    const name = kind === 'melee' ? 'Melee' : 'Ranged';
    out.push(field(`${kind}-name`, `${name} Attack Name`));
    out.push(field(`${kind}-atk-total`, `${name} — Attack Bonus`, 'number', { readonly: true, total: true }));
    out.push(field(`${kind}-atk-half`, `${name} — Attack ½ Lvl`, 'number', { readonly: true }));
    for (const part of ['abil', 'class', 'prof', 'feat', 'enh', 'misc']) {
      out.push(field(`${kind}-atk-${part}`, `${name} — Attack ${part.toUpperCase()}`, 'number'));
    }
    out.push(field(`${kind}-dice`, `${name} — Damage Dice`));
    out.push(field(`${kind}-dmg-total`, `${name} — Damage Bonus`, 'number', { readonly: true, total: true }));
    for (const part of ['abil', 'feat', 'enh', 'misc', 'misc2']) {
      out.push(field(`${kind}-dmg-${part}`, `${name} — Damage ${part.toUpperCase()}`, 'number'));
    }
  }
  return out;
}

function basicAttackFields() {
  const out = [];
  for (let i = 1; i <= 4; i++) {
    out.push(field(`basic${i}-atk`, `Basic Attack ${i} — Attack`, 'number'));
    out.push(field(`basic${i}-vs`, `Basic Attack ${i} — vs`));
    out.push(field(`basic${i}-weapon`, `Basic Attack ${i} — Weapon or Power`));
    out.push(field(`basic${i}-dmg`, `Basic Attack ${i} — Damage`));
  }
  return out;
}

/**
 * Tabbed layout for the wizard sheet mirror (display only; field ids unchanged).
 * @returns {{ id: string, label: string, sections: { title: string, fields: ReturnType<typeof field>[] }[] }[]}
 */
export function getSheetMirrorTabs() {
  return [
    {
      id: 'identity',
      label: 'Identity',
      sections: [{ title: 'Identity', fields: identityFields() }]
    },
    {
      id: 'combat',
      label: 'Combat',
      sections: [
        { title: 'Initiative', fields: initiativeFields() },
        { title: 'Hit Points', fields: hitPointFields() },
        { title: 'Defenses', fields: defenseFields() },
        { title: 'Action Points', fields: actionPointFields() }
      ]
    },
    {
      id: 'abilities',
      label: 'Abilities',
      sections: [{ title: 'Ability Scores', fields: abilityFields() }]
    },
    {
      id: 'skills',
      label: 'Skills',
      sections: [{ title: 'Skills', layout: 'skills-table', fields: skillFields() }]
    },
    {
      id: 'attacks',
      label: 'Attacks',
      sections: [
        { title: 'Attack Workspace', fields: attackFields() },
        { title: 'Basic Attacks', fields: basicAttackFields() }
      ]
    },
    {
      id: 'traits',
      label: 'Traits',
      sections: [
        { title: 'Movement', fields: movementFields() },
        { title: 'Senses', fields: senseFields() },
        { title: 'Race / Class Features', fields: traitFields() }
      ]
    },
    {
      id: 'collection',
      label: 'Collection',
      sections: [{ title: 'Feats, Powers & Rituals', fields: collectionFields() }]
    }
  ];
}

/** Flat section list (all tabs) for payload sync. */
export function getSheetMirrorSections() {
  return getSheetMirrorTabs().flatMap((tab) => tab.sections);
}

export { ABILITIES as MIRROR_ABILITIES };
