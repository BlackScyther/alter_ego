/**
 * Persistent character-sheet mirror for the creation wizard.
 */

import { characterToSheetPayload } from '../character/sheet-bridge.js';
import {
  abilityModifier,
  actionPointsFromMilestones,
  attackBonus,
  bloodied,
  damageBonus,
  defenseTenPlusHalf,
  defenseTotal,
  halfLevel,
  initiative,
  modPlusHalfLevel,
  passiveSense,
  skillBonus,
  speedTotal,
  surgeValue,
  SKILLS
} from '../formulas.js';
import {
  getFinalScores,
  getSkillBonusTotals,
  recomputeAbilityScores,
  recomputeSkillBonuses
} from '../character/tutor.js';
import { ensureDerivedBonuses } from '../character/hp.js';
import { getSheetMirrorSections, getSheetMirrorTabs } from './sheet-mirror-fields.js';
import { renderSkillsTableHtml } from './skills-table.js';
import { COLLAPSIBLE_CHEVRON_SVG } from './collapsible-chevron.js';

const COLLAPSE_KEY = 'dnd4e.sheetMirrorCollapsed';
const TAB_KEY = 'dnd4e.sheetMirrorTab';

/** @type {HTMLElement | null} */
let rootEl = null;
/** @type {HTMLElement | null} */
let bodyEl = null;
/** @type {HTMLElement | null} */
let summaryEl = null;
/** @type {HTMLElement | null} */
let portraitEl = null;
/** @type {((character: object) => void) | null} */
let onChangeHandler = null;
let structureBuilt = false;
let collapsed = false;
/** @type {string} */
let activeTabId = 'identity';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function ensureSheetExtras(character) {
  if (!character.sheet) character.sheet = {};
  if (!character.sheet.extraFields) character.sheet.extraFields = {};
  if (!character.sheet.skills) character.sheet.skills = {};
  if (!character.sheet.session) character.sheet.session = {};
  return character;
}

function getExtra(character, id, fallback = '') {
  ensureSheetExtras(character);
  const val = character.sheet.extraFields[id];
  return val === undefined || val === null ? fallback : val;
}

function setExtra(character, id, value) {
  ensureSheetExtras(character);
  character.sheet.extraFields[id] = value;
}

function getSkillState(character, skillId) {
  ensureSheetExtras(character);
  if (!character.sheet.skills[skillId]) character.sheet.skills[skillId] = {};
  return character.sheet.skills[skillId];
}

/**
 * Build full mirror payload: sheet-bridge values + computed fields.
 * @param {object} character
 */
export function buildMirrorPayload(character) {
  ensureSheetExtras(character);
  recomputeAbilityScores(character);
  recomputeSkillBonuses(character);

  const id = character.identity ?? {};
  const lvl = Number(id.level) || 1;
  const scores = getFinalScores(character);
  const sheet = character.sheet;
  const hp = sheet.hp ?? {};
  const defenses = sheet.defenses ?? {};
  const speed = sheet.speed ?? {};
  const skillTotals = getSkillBonusTotals(character);
  const globalArmor = Number(sheet.armorPenaltyGlobal) || 0;
  ensureDerivedBonuses(character);
  const initDerived = Number(sheet.derivedBonuses?.initiative) || 0;
  const initMiscManual = Number(sheet.initMisc) || 0;
  const initMiscTotal = initMiscManual + initDerived;

  const payload = {
    ...characterToSheetPayload(character),
    'init-total': initiative(scores.dex, lvl, initMiscTotal),
    'init-dex': abilityModifier(scores.dex),
    'init-half': halfLevel(lvl),
    'init-misc-derived': initDerived,
    'init-conditional': getExtra(character, 'init-conditional'),
    'save-mods': getExtra(character, 'save-mods'),
    resistances: getExtra(character, 'resistances'),
    conditions: getExtra(character, 'conditions'),
    'special-movement': getExtra(character, 'special-movement'),
    'special-senses': getExtra(character, 'special-senses'),
    bloodied: bloodied(hp.max),
    'surge-value': surgeValue(hp.max),
    'second-wind': Boolean(sheet.session.secondWind),
    'death-fail-1': Boolean(sheet.session.deathFail1),
    'death-fail-2': Boolean(sheet.session.deathFail2),
    'death-fail-3': Boolean(sheet.session.deathFail3),
    'action-points-total': actionPointsFromMilestones(sheet.milestones),
    'speed-total': speedTotal(speed),
    feats: character.notes?.feats ?? '',
    'background-features': character.notes?.backgroundFeatures ?? ''
  };

  for (const ab of ['str', 'con', 'dex', 'int', 'wis', 'cha']) {
    const score = Number(scores[ab]) || 10;
    payload[`${ab}-mod`] = abilityModifier(score);
    payload[`${ab}-mod-half`] = modPlusHalfLevel(score, lvl);
  }

  for (const def of ['ac', 'fort', 'ref', 'will']) {
    const parts = defenses[def] ?? {};
    payload[`${def}-ten`] = defenseTenPlusHalf(lvl);
    payload[`${def}-half`] = halfLevel(lvl);
    payload[`${def}-total`] = defenseTotal(lvl, {
      abil: Number(parts.abil) || 0,
      class: Number(parts.class) || 0,
      feat: Number(parts.feat) || 0,
      enh: Number(parts.enh) || 0,
      misc: Number(parts.misc) || 0,
      misc2: Number(parts.misc2) || 0,
      armor: Number(parts.armor) || 0
    });
    payload[`${def}-conditional`] = getExtra(character, `${def}-conditional`);
  }

  const skillBonusesForPassive = {};
  for (const skill of SKILLS) {
    const state = getSkillState(character, skill.id);
    const trained = Boolean(state.trained);
    const pen = skill.armorPenalty
      ? globalArmor + (Number(state.pen) || 0)
      : Number(state.pen) || 0;
    const misc = Number(skillTotals[skill.id]) || Number(state.misc) || 0;
    const bonus = skillBonus(scores[skill.ability], lvl, trained, pen, misc);
    payload[`skill-${skill.id}-bonus`] = bonus;
    payload[`skill-${skill.id}-mod-half`] = modPlusHalfLevel(scores[skill.ability], lvl);
    payload[`skill-${skill.id}-trained`] = trained;
    if (skill.armorPenalty) payload[`skill-${skill.id}-pen`] = Number(state.pen) || 0;
    payload[`skill-${skill.id}-misc`] = misc;
    skillBonusesForPassive[skill.id] = bonus;
  }

  payload['passive-insight'] = passiveSense(skillBonusesForPassive.insight ?? 0);
  payload['passive-perception'] = passiveSense(skillBonusesForPassive.perception ?? 0);

  for (const kind of ['melee', 'ranged']) {
    const atk = getExtraFieldsGroup(character, kind, 'atk');
    const dmg = getExtraFieldsGroup(character, kind, 'dmg');
    payload[`${kind}-name`] = getExtra(character, `${kind}-name`, kind === 'melee' ? 'Melee Basic Attack — Unarmed' : 'Ranged Basic Attack — Unarmed');
    payload[`${kind}-atk-half`] = halfLevel(lvl);
    payload[`${kind}-atk-total`] = attackBonus(lvl, atk);
    for (const [key, val] of Object.entries(atk)) {
      payload[`${kind}-atk-${key}`] = val;
    }
    payload[`${kind}-dice`] = getExtra(character, `${kind}-dice`, '1d4');
    payload[`${kind}-dmg-total`] = damageBonus(dmg);
    for (const [key, val] of Object.entries(dmg)) {
      payload[`${kind}-dmg-${key}`] = val;
    }
  }

  for (let i = 1; i <= 4; i++) {
    const defaults = {
      1: { atk: '', vs: 'AC', weapon: 'Melee Basic Attack — Unarmed', dmg: '1d4' },
      2: { atk: '', vs: 'AC', weapon: 'Ranged Basic Attack — Unarmed', dmg: '1d4' },
      3: { atk: '', vs: '', weapon: '', dmg: '' },
      4: { atk: '', vs: '', weapon: '', dmg: '' }
    };
    const d = defaults[i];
    payload[`basic${i}-atk`] = getExtra(character, `basic${i}-atk`, d.atk);
    payload[`basic${i}-vs`] = getExtra(character, `basic${i}-vs`, d.vs);
    payload[`basic${i}-weapon`] = getExtra(character, `basic${i}-weapon`, d.weapon);
    payload[`basic${i}-dmg`] = getExtra(character, `basic${i}-dmg`, d.dmg);
  }

  return payload;
}

function getExtraFieldsGroup(character, kind, prefix) {
  const keys = prefix === 'atk' ? ['abil', 'class', 'prof', 'feat', 'enh', 'misc'] : ['abil', 'feat', 'enh', 'misc', 'misc2'];
  const out = {};
  for (const key of keys) {
    out[key] = Number(getExtra(character, `${kind}-${prefix}-${key}`, 0)) || 0;
  }
  return out;
}

/**
 * Write a mirror field value back into the character document.
 * @param {object} character
 * @param {string} fieldId
 * @param {string|number|boolean} rawValue
 */
export function applySheetValueToCharacter(character, fieldId, rawValue) {
  ensureSheetExtras(character);
  const id = character.identity;

  const identityMap = {
    'player-name': 'playerName',
    'character-name': 'characterName',
    level: 'level',
    class: 'class',
    'paragon-path': 'paragonPath',
    'epic-destiny': 'epicDestiny',
    race: 'race',
    size: 'size',
    age: 'age',
    gender: 'gender',
    height: 'height',
    weight: 'weight',
    alignment: 'alignment',
    deity: 'deity',
    company: 'company',
    'total-xp': 'totalXp'
  };

  if (identityMap[fieldId]) {
    const key = identityMap[fieldId];
    id[key] = fieldId === 'level' || fieldId === 'total-xp' ? Number(rawValue) || 0 : String(rawValue ?? '');
    return character;
  }

  if (fieldId === 'init-misc') {
    character.sheet.initMisc = Number(rawValue) || 0;
    return character;
  }
  if (fieldId === 'milestones') {
    character.sheet.milestones = Math.min(2, Math.max(0, Number(rawValue) || 0));
    return character;
  }
  if (fieldId === 'armor-penalty-global') {
    character.sheet.armorPenaltyGlobal = Number(rawValue) || 0;
    return character;
  }

  const hpMap = {
    'max-hp': 'max',
    'current-hp': 'current',
    'temp-hp': 'temp',
    'surges-day': 'surgesPerDay',
    'surge-uses': 'surgeUses'
  };
  if (hpMap[fieldId]) {
    character.sheet.hp = character.sheet.hp ?? {};
    character.sheet.hp[hpMap[fieldId]] = Number(rawValue) || 0;
    return character;
  }

  const sessionMap = {
    'second-wind': 'secondWind',
    'death-fail-1': 'deathFail1',
    'death-fail-2': 'deathFail2',
    'death-fail-3': 'deathFail3'
  };
  if (sessionMap[fieldId]) {
    character.sheet.session[sessionMap[fieldId]] = Boolean(rawValue);
    return character;
  }

  const notesMap = {
    'race-features': 'raceFeatures',
    'racial-powers': 'racialPowers',
    'background-features': 'backgroundFeatures',
    'class-features': 'classFeatures',
    'class-powers': 'powers',
    languages: 'languages',
    'ap-effects': 'apEffects',
    feats: 'feats',
    rituals: 'rituals'
  };
  if (notesMap[fieldId]) {
    character.notes = character.notes ?? {};
    character.notes[notesMap[fieldId]] = String(rawValue ?? '');
    return character;
  }

  const speedMap = {
    'speed-base': 'base',
    'speed-armor': 'armor',
    'speed-item': 'item',
    'speed-misc': 'misc'
  };
  if (speedMap[fieldId]) {
    character.sheet.speed = character.sheet.speed ?? {};
    character.sheet.speed[speedMap[fieldId]] = Number(rawValue) || 0;
    return character;
  }

  const defMatch = fieldId.match(/^(ac|fort|ref|will)-(abil|class|feat|enh|misc|armor)$/);
  if (defMatch) {
    const [, def, part] = defMatch;
    character.sheet.defenses = character.sheet.defenses ?? {};
    character.sheet.defenses[def] = character.sheet.defenses[def] ?? {};
    character.sheet.defenses[def][part] = Number(rawValue) || 0;
    return character;
  }

  const skillTrained = fieldId.match(/^skill-(.+)-trained$/);
  if (skillTrained) {
    getSkillState(character, skillTrained[1]).trained = Boolean(rawValue);
    return character;
  }

  const skillPen = fieldId.match(/^skill-(.+)-pen$/);
  if (skillPen) {
    getSkillState(character, skillPen[1]).pen = Number(rawValue) || 0;
    return character;
  }

  const skillMisc = fieldId.match(/^skill-(.+)-misc$/);
  if (skillMisc) {
    getSkillState(character, skillMisc[1]).misc = Number(rawValue) || 0;
    return character;
  }

  const atkMatch = fieldId.match(/^(melee|ranged)-atk-(abil|class|prof|feat|enh|misc)$/);
  if (atkMatch) {
    setExtra(character, fieldId, Number(rawValue) || 0);
    return character;
  }

  const dmgMatch = fieldId.match(/^(melee|ranged)-dmg-(abil|feat|enh|misc|misc2)$/);
  if (dmgMatch) {
    setExtra(character, fieldId, Number(rawValue) || 0);
    return character;
  }

  if (fieldId.endsWith('-name') || fieldId.endsWith('-dice') || fieldId.startsWith('basic')) {
    setExtra(character, fieldId, String(rawValue ?? ''));
    return character;
  }

  setExtra(character, fieldId, rawValue);
  return character;
}

function isFieldReadonly(fieldDef, payload, fieldId) {
  if (fieldDef.readonly) return true;
  if (fieldDef.wizardReadonly) {
    if (/^skill-.+-misc$/.test(fieldId)) {
      return Number(payload[fieldId]) !== 0;
    }
    const val = payload[fieldId];
    if (val !== undefined && val !== null && val !== '') return true;
  }
  return false;
}

function renderFieldHtml(f) {
  const inputId = `mirror-${f.id}`;
  if (f.type === 'textarea') {
    return `<label class="sheet-mirror-field sheet-mirror-field--textarea" for="${inputId}">
      <span class="sheet-mirror-label">${esc(f.label)}</span>
      <textarea id="${inputId}" data-field-id="${f.id}" rows="2"></textarea>
    </label>`;
  }
  if (f.type === 'checkbox') {
    return `<label class="sheet-mirror-field sheet-mirror-field--checkbox">
      <input type="checkbox" id="${inputId}" data-field-id="${f.id}" />
      <span class="sheet-mirror-label">${esc(f.label)}</span>
    </label>`;
  }
  const kind = f.type === 'number' ? 'number' : 'text';
  return `<label class="sheet-mirror-field sheet-mirror-field--${kind}" for="${inputId}">
    <span class="sheet-mirror-label">${esc(f.label)}</span>
    <input type="${kind}" id="${inputId}" data-field-id="${f.id}" />
  </label>`;
}

function renderSectionContent(section) {
  if (section.layout === 'skills-table') {
    return renderSkillsTableHtml({ idPrefix: 'mirror' });
  }
  return `<div class="sheet-mirror-fields">${renderSectionFieldsHtml(section.fields)}</div>`;
}

/** Render section fields, wrapping consecutive fields with the same `row` key in one row. */
function renderSectionFieldsHtml(fields) {
  const chunks = [];
  let i = 0;
  while (i < fields.length) {
    const f = fields[i];
    if (!f.row) {
      chunks.push(renderFieldHtml(f));
      i += 1;
      continue;
    }
    const group = [];
    const rowKey = f.row;
    while (i < fields.length && fields[i].row === rowKey) {
      group.push(renderFieldHtml(fields[i]));
      i += 1;
    }
    chunks.push(`<div class="sheet-mirror-row">${group.join('')}</div>`);
  }
  return chunks.join('');
}

function loadActiveTabId() {
  const tabs = getSheetMirrorTabs();
  try {
    const stored = sessionStorage.getItem(TAB_KEY);
    if (stored && tabs.some((tab) => tab.id === stored)) return stored;
  } catch {
    /* ignore */
  }
  return tabs[0]?.id ?? 'identity';
}

function setActiveTab(tabId) {
  const tabs = getSheetMirrorTabs();
  if (!tabs.some((tab) => tab.id === tabId)) return;
  activeTabId = tabId;
  try {
    sessionStorage.setItem(TAB_KEY, tabId);
  } catch {
    /* ignore */
  }
  updateTabUi();
}

function updateTabUi() {
  if (!bodyEl) return;
  const tabs = bodyEl.querySelectorAll('[role="tab"]');
  const panels = bodyEl.querySelectorAll('[role="tabpanel"]');
  for (const tab of tabs) {
    const selected = tab.dataset.tabId === activeTabId;
    tab.setAttribute('aria-selected', selected ? 'true' : 'false');
    tab.tabIndex = selected ? 0 : -1;
    tab.classList.toggle('sheet-mirror-tab--active', selected);
  }
  for (const panel of panels) {
    const visible = panel.dataset.tabId === activeTabId;
    panel.hidden = !visible;
  }
}

function onTabKeydown(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement) || target.getAttribute('role') !== 'tab') return;
  const tabs = [...bodyEl.querySelectorAll('[role="tab"]')];
  const index = tabs.indexOf(target);
  if (index < 0) return;

  let next = index;
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    next = (index + 1) % tabs.length;
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    next = (index - 1 + tabs.length) % tabs.length;
  } else if (event.key === 'Home') {
    next = 0;
  } else if (event.key === 'End') {
    next = tabs.length - 1;
  } else {
    return;
  }

  event.preventDefault();
  const nextTab = tabs[next];
  const tabId = nextTab.dataset.tabId;
  if (tabId) {
    setActiveTab(tabId);
    nextTab.focus();
  }
}

function buildStructure() {
  if (!bodyEl) return;
  activeTabId = loadActiveTabId();
  const mirrorTabs = getSheetMirrorTabs();

  const tabButtons = mirrorTabs
    .map((tab) => {
      const panelId = `mirror-tabpanel-${tab.id}`;
      const selected = tab.id === activeTabId;
      return `<button
        type="button"
        class="sheet-mirror-tab${selected ? ' sheet-mirror-tab--active' : ''}"
        role="tab"
        id="mirror-tab-${tab.id}"
        data-tab-id="${esc(tab.id)}"
        aria-selected="${selected ? 'true' : 'false'}"
        aria-controls="${panelId}"
        tabindex="${selected ? '0' : '-1'}"
      >${esc(tab.label)}</button>`;
    })
    .join('');

  const tabPanels = mirrorTabs
    .map((tab) => {
      const panelId = `mirror-tabpanel-${tab.id}`;
      const sections = tab.sections
        .map((section) => {
          const sectionClass =
            section.layout === 'skills-table'
              ? 'sheet-mirror-section sheet-mirror-section--skills-table'
              : 'sheet-mirror-section';
          const titleHtml =
            section.layout === 'skills-table'
              ? ''
              : `<h3 class="sheet-mirror-section-title">${esc(section.title)}</h3>`;
          return `
        <section class="${sectionClass}">
          ${titleHtml}
          ${renderSectionContent(section)}
        </section>`;
        })
        .join('');
      return `<div
        class="sheet-mirror-tabpanel"
        role="tabpanel"
        id="${panelId}"
        data-tab-id="${esc(tab.id)}"
        aria-labelledby="mirror-tab-${tab.id}"
        ${tab.id === activeTabId ? '' : 'hidden'}
      >${sections}</div>`;
    })
    .join('');

  bodyEl.innerHTML = `
    <div class="sheet-mirror-tabs" role="tablist" aria-label="Character sheet sections">
      ${tabButtons}
    </div>
    <div class="sheet-mirror-tabpanels">
      ${tabPanels}
    </div>`;
  structureBuilt = true;

  bodyEl.querySelector('.sheet-mirror-tabs')?.addEventListener('click', (event) => {
    const tab = event.target.closest('[role="tab"]');
    if (!tab?.dataset.tabId) return;
    setActiveTab(tab.dataset.tabId);
    tab.focus();
  });
  bodyEl.querySelector('.sheet-mirror-tabs')?.addEventListener('keydown', onTabKeydown);

  for (const input of bodyEl.querySelectorAll('[data-field-id]')) {
    const handler = () => {
      if (!onChangeHandler || input.readOnly || input.getAttribute('aria-readonly') === 'true') return;
      const fieldId = input.dataset.fieldId;
      const value = input.type === 'checkbox' ? input.checked : input.value;
      onChangeHandler(fieldId, value);
    };
    input.addEventListener('input', handler);
    input.addEventListener('change', handler);
  }
}

function updateSummary(character) {
  if (!summaryEl) return;
  const id = character.identity ?? {};
  const name = id.characterName?.trim() || 'Unnamed';
  const lvl = id.level ?? 1;
  const race = id.race?.trim();
  const cls = id.class?.trim();
  const parts = [`${name} · Lv ${lvl}`];
  if (race) parts.push(race);
  if (cls) parts.push(cls);
  summaryEl.textContent = parts.join(' · ');
}

function updatePortrait(character) {
  if (!portraitEl) return;
  const dataUrl = character.portrait?.dataUrl;
  if (dataUrl) {
    portraitEl.innerHTML = `<img src="${esc(dataUrl)}" alt="" width="48" height="48" />`;
    portraitEl.hidden = false;
  } else {
    portraitEl.innerHTML = '';
    portraitEl.hidden = true;
  }
}

function updateToggleUi() {
  rootEl?.classList.toggle('sheet-mirror-panel--collapsed', collapsed);
  const toggle = rootEl?.querySelector('.sheet-mirror-toggle');
  if (toggle) {
    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    toggle.setAttribute(
      'aria-label',
      collapsed ? 'Expand character sheet preview' : 'Collapse character sheet preview'
    );
    const label = toggle.querySelector('.sheet-mirror-toggle-label');
    const hint = toggle.querySelector('.sheet-mirror-toggle-hint');
    if (label) label.textContent = 'Character sheet';
    if (hint) hint.textContent = collapsed ? 'Show fields' : 'Hide fields';
  }
  if (bodyEl) bodyEl.classList.toggle('sheet-mirror-body--collapsed', collapsed);
}

function setCollapsedState(next) {
  collapsed = next;
  try {
    sessionStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
  } catch {
    /* ignore */
  }
  updateToggleUi();
}

/**
 * @param {HTMLElement} container
 * @param {(fieldId: string, value: string|number|boolean) => void} onChange
 */
export function initSheetMirror(container, onChange) {
  rootEl = container;
  onChangeHandler = onChange;

  try {
    collapsed = sessionStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    collapsed = false;
  }

  container.innerHTML = `
    <div class="sheet-mirror-header">
      <button
        type="button"
        class="sheet-mirror-toggle"
        aria-expanded="${collapsed ? 'false' : 'true'}"
        aria-controls="sheet-mirror-body"
        aria-label="${collapsed ? 'Expand character sheet preview' : 'Collapse character sheet preview'}"
      >
        ${COLLAPSIBLE_CHEVRON_SVG}
        <span class="sheet-mirror-toggle-text">
          <span class="sheet-mirror-toggle-label">Character sheet</span>
          <span class="sheet-mirror-toggle-hint">${collapsed ? 'Show fields' : 'Hide fields'}</span>
        </span>
      </button>
      <div class="sheet-mirror-header-meta">
        <div class="sheet-mirror-portrait" hidden></div>
        <p class="sheet-mirror-summary m-0"></p>
      </div>
    </div>
    <div id="sheet-mirror-body" class="sheet-mirror-body${collapsed ? ' sheet-mirror-body--collapsed' : ''}"></div>`;

  bodyEl = container.querySelector('#sheet-mirror-body');
  summaryEl = container.querySelector('.sheet-mirror-summary');
  portraitEl = container.querySelector('.sheet-mirror-portrait');

  container.querySelector('.sheet-mirror-toggle')?.addEventListener('click', () => {
    setCollapsedState(!collapsed);
  });

  buildStructure();
  setCollapsedState(collapsed);
}

/**
 * @param {object} character
 */
export function renderSheetMirror(character) {
  if (!rootEl || !bodyEl) return;
  if (!structureBuilt) buildStructure();

  const payload = buildMirrorPayload(character);
  const sections = getSheetMirrorSections();
  const fieldMap = new Map();
  for (const section of sections) {
    for (const f of section.fields) fieldMap.set(f.id, f);
  }

  const activeId = document.activeElement?.dataset?.fieldId;

  for (const [fieldId, fieldDef] of fieldMap) {
    const el = bodyEl.querySelector(`[data-field-id="${fieldId}"]`);
    if (!el) continue;

    const readonly = isFieldReadonly(fieldDef, payload, fieldId);
    el.readOnly = readonly;
    el.setAttribute('aria-readonly', readonly ? 'true' : 'false');
    if (readonly) el.classList.add('sheet-mirror-readonly');
    else el.classList.remove('sheet-mirror-readonly');

    if (activeId === fieldId && document.activeElement === el) continue;

    const val = payload[fieldId];
    if (el.type === 'checkbox') {
      el.checked = Boolean(val);
    } else if (val !== undefined && val !== null) {
      el.value = val;
    } else if (!readonly) {
      el.value = '';
    }
  }

  updateSummary(character);
  updatePortrait(character);
}

/**
 * @param {boolean} visible
 */
export function setSheetMirrorVisible(visible) {
  if (!rootEl) return;
  rootEl.classList.toggle('hidden', !visible);
  document.querySelector('.editor-main')?.classList.toggle('editor-main--wizard', visible);
}
