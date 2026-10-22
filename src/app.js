import {
  halfLevel,
  abilityModifier,
  modPlusHalfLevel,
  defenseTenPlusHalf,
  initiative,
  defenseTotal,
  attackBonus,
  damageBonus,
  skillBonus,
  passiveSense,
  bloodied,
  surgeValue,
  speedTotal,
  xpForLevel,
  actionPointsFromMilestones,
  SKILLS,
  buildLevelTable
} from './formulas.js';
import { writeSheetField } from './sheet/sheet-fields.js';

const $ = (sel, root = document) => root.querySelector(sel);

function num(id) {
  const el = document.getElementById(id);
  if (!el) return 0;
  if (el.dataset && el.dataset.value !== undefined && el.dataset.value !== '') {
    return Number(el.dataset.value) || 0;
  }
  if ('value' in el && el.value !== undefined && el.value !== '') return Number(el.value) || 0;
  return Number(el.textContent) || 0;
}

function textOf(id) {
  const el = document.getElementById(id);
  if (!el) return '';
  if (el.dataset && el.dataset.value !== undefined && el.dataset.value !== '') return el.dataset.value;
  return (el.textContent ?? '').trim();
}

function isOn(id) {
  const el = document.getElementById(id);
  if (!el) return false;
  if (el.classList.contains('sheet-mark')) return el.dataset.value === '1';
  return Boolean(el.checked);
}

function setSheetValue(id, value, display) {
  const el = document.getElementById(id);
  writeSheetField(el, value);
  if (el && display !== undefined && !el.classList.contains('sheet-mark')) {
    el.textContent = String(display);
  }
}

function setCalc(id, value) {
  const v = Number(value);
  setSheetValue(id, Number.isFinite(v) ? (Number.isInteger(v) ? v : v) : '');
}

function formatSigned(n) {
  const v = Number(n) || 0;
  if (v > 0) return `+${v}`;
  return String(v);
}

function shortenAttackName(text) {
  const raw = String(text || '').trim();
  const parts = raw.split(/\s+[—–-]\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : raw;
}

function formatDamage(dice, bonus) {
  const d = String(dice || '').trim();
  const b = Number(bonus) || 0;
  if (!d || d === '0') return b ? formatSigned(b) : '';
  if (!b) return d;
  return `${d}${b > 0 ? `+${b}` : b}`;
}

function level() {
  return Math.min(30, Math.max(1, num('level') || 1));
}

function abilityScores() {
  return {
    str: num('str-score'),
    con: num('con-score'),
    dex: num('dex-score'),
    int: num('int-score'),
    wis: num('wis-score'),
    cha: num('cha-score')
  };
}

function recalcAbilities() {
  const lvl = level();
  const abilities = ['str', 'con', 'dex', 'int', 'wis', 'cha'];
  for (const ab of abilities) {
    const score = num(`${ab}-score`);
    setCalc(`${ab}-mod`, abilityModifier(score));
    setCalc(`${ab}-mod-half`, modPlusHalfLevel(score, lvl));
  }
}

function recalcInitiative() {
  const lvl = level();
  setCalc('init-dex', abilityModifier(num('dex-score')));
  setCalc('init-half', halfLevel(lvl));
  setCalc('init-total', initiative(num('dex-score'), lvl, num('init-misc')));
}

function recalcDefenses() {
  const lvl = level();
  const defs = ['ac', 'fort', 'ref', 'will'];
  for (const d of defs) {
    setCalc(`${d}-ten`, defenseTenPlusHalf(lvl));
    setCalc(`${d}-half`, halfLevel(lvl));
    const total = defenseTotal(lvl, {
      abil: num(`${d}-abil`),
      class: num(`${d}-class`),
      feat: num(`${d}-feat`),
      enh: num(`${d}-enh`),
      misc: num(`${d}-misc`),
      misc2: num(`${d}-misc2`),
      armor: num(`${d}-armor`)
    });
    setCalc(`${d}-total`, total);
  }
}

function recalcHp() {
  const max = num('max-hp');
  setCalc('bloodied', bloodied(max));
  setCalc('surge-value', surgeValue(max));
}

function recalcSkills() {
  const lvl = level();
  const scores = abilityScores();
  const globalArmor = num('armor-penalty-global');

  for (const skill of SKILLS) {
    const trained = isOn(`skill-${skill.id}-trained`);
    const misc = num(`skill-${skill.id}-misc`);
    const rawPen = num(`skill-${skill.id}-pen`);
    const pen = skill.armorPenalty ? globalArmor + rawPen : rawPen;
    const bonus = skillBonus(scores[skill.ability], lvl, trained, pen, misc);
    setCalc(`skill-${skill.id}-bonus`, bonus);
    setCalc(`skill-${skill.id}-mod-half`, modPlusHalfLevel(scores[skill.ability], lvl));
    if (skill.armorPenalty) {
      const penEl = document.getElementById(`skill-${skill.id}-pen`);
      if (penEl) penEl.textContent = String(pen);
    }
  }

  setCalc('passive-insight', passiveSense(num('skill-insight-bonus')));
  setCalc('passive-perception', passiveSense(num('skill-perception-bonus')));
}

function recalcMovement() {
  setCalc('speed-total', speedTotal({
    base: num('speed-base'),
    armor: num('speed-armor'),
    item: num('speed-item'),
    misc: num('speed-misc')
  }));
}

function recalcAttacks() {
  const lvl = level();
  ['melee', 'ranged'].forEach((kind) => {
    setCalc(`${kind}-atk-half`, halfLevel(lvl));
    const atk = attackBonus(lvl, {
      abil: num(`${kind}-atk-abil`),
      class: num(`${kind}-atk-class`),
      prof: num(`${kind}-atk-prof`),
      feat: num(`${kind}-atk-feat`),
      enh: num(`${kind}-atk-enh`),
      misc: num(`${kind}-atk-misc`)
    });
    setCalc(`${kind}-atk-total`, atk);
    const dmg = damageBonus({
      abil: num(`${kind}-dmg-abil`),
      feat: num(`${kind}-dmg-feat`),
      enh: num(`${kind}-dmg-enh`),
      misc: num(`${kind}-dmg-misc`),
      misc2: num(`${kind}-dmg-misc2`)
    });
    setCalc(`${kind}-dmg-total`, dmg);
    const row = kind === 'melee' ? 'basic1' : 'basic2';
    setSheetValue(`${row}-atk`, atk, formatSigned(atk));
    const dice = textOf(`${kind}-dice`) || textOf(`${row}-dmg`);
    setSheetValue(`${row}-damage`, formatDamage(dice, dmg));
    const name = textOf(`${kind}-name`) || textOf(`${row}-weapon`);
    if (name) setSheetValue(`${row}-weapon`, name, shortenAttackName(name));
  });
  for (const n of [3, 4]) {
    const row = document.getElementById(`basic${n}-weapon`)?.closest('tr');
    if (!row) continue;
    const filled = ['atk', 'vs', 'weapon', 'dmg'].some((key) => textOf(`basic${n}-${key}`).trim());
    row.hidden = !filled;
  }
}

function recalcActionPoints() {
  const milestones = num('milestones');
  setCalc('action-points-total', actionPointsFromMilestones(milestones));
}

function syncXpHint() {
  const hint = $('#xp-for-level');
  if (hint) hint.textContent = `XP to reach level ${level()}: ${xpForLevel(level()).toLocaleString()}`;
}

function recalcAll() {
  recalcAbilities();
  recalcInitiative();
  recalcDefenses();
  recalcHp();
  recalcSkills();
  recalcMovement();
  recalcAttacks();
  recalcActionPoints();
  syncXpHint();
}

function applyScale(scale) {
  document.documentElement.style.setProperty('--scale', String(scale));
  const label = $('#scale-label');
  if (label) label.textContent = `${Math.round(scale * 100)}%`;
}

function dimensionsUrl() {
  return location.pathname.includes('/sheet/') ? '../../dimensions.json' : '../dimensions.json';
}

function loadDimensions() {
  return fetch(dimensionsUrl())
    .then((r) => r.json())
    .then((d) => {
      if (d.scale) applyScale(d.scale);
      const meta = $('#dim-meta');
      if (meta) {
        meta.textContent = d.page.widthMm && d.page.heightMm
          ? `${d.page.name || 'Page'} ${d.page.widthMm} mm × ${d.page.heightMm} mm`
          : `Page ${d.page.widthIn}" × ${d.page.heightIn}" (content ${d.page.contentWidthIn}" × ${d.page.contentHeightIn}")`;
      }
    })
    .catch(() => {});
}

function renderLevelTable() {
  const tbody = $('#level-table-body');
  if (!tbody) return;
  const rows = buildLevelTable(30);
  tbody.innerHTML = rows
    .map(
      (r) => `<tr>
        <td>${r.level}</td>
        <td>${r.tier}</td>
        <td>${r.halfLevel}</td>
        <td>${r.defenseBase}</td>
        <td>${r.xp.toLocaleString()}</td>
        <td>+${r.modPlusHalfAt10}</td>
      </tr>`
    )
    .join('');
}

let screenScale = 1;

function wireEvents() {
  $('#scale-slider')?.addEventListener('input', (e) => {
    screenScale = Number(e.target.value) / 100;
    applyScale(screenScale);
  });

  window.addEventListener('beforeprint', () => applyScale(1));
  window.addEventListener('afterprint', () => applyScale(screenScale));

  $('#btn-print')?.addEventListener('click', () => window.print());

  const cardsBox = $('#include-power-cards');
  if (cardsBox) {
    const stored = sessionStorage.getItem('sheet.includePowerCards');
    if (stored !== null) cardsBox.checked = stored === '1';
    cardsBox.addEventListener('change', () => {
      sessionStorage.setItem('sheet.includePowerCards', cardsBox.checked ? '1' : '0');
      refreshPowerCards();
    });
  }
}

async function refreshPowerCards() {
  const host = document.getElementById('power-cards');
  if (!host) return;
  const include = document.getElementById('include-power-cards')?.checked;
  if (!include) {
    host.hidden = true;
    host.replaceChildren();
    return;
  }
  try {
    const { loadActiveCharacter } = await import('./character/store.js');
    const character = loadActiveCharacter();
    if (!character) {
      host.hidden = true;
      host.replaceChildren();
      return;
    }
    const { compendium } = await import('./data/compendium.js');
    const { renderRuleCards } = await import('./print/rule-cards.js');
    const count = await renderRuleCards(host, character, compendium, ['powers']);
    host.hidden = count === 0;
  } catch {
    host.hidden = true;
  }
}

function applyEditorPayload() {
  const params = new URLSearchParams(location.search);
  const from = params.get('from');
  if (from !== 'editor' && from !== 'gm') return;

  const raw = localStorage.getItem('dnd4e.sheetPayload');
  if (!raw) return;

  try {
    const payload = JSON.parse(raw);
    for (const [fieldId, value] of Object.entries(payload)) {
      writeSheetField(document.getElementById(fieldId), value);
    }
    recalcAll();
  } catch {
    /* ignore */
  }
}

function wireBackLink() {
  const link = document.getElementById('back-to-editor');
  if (!link) return;
  const params = new URLSearchParams(location.search);
  if (params.get('mode') === 'player') {
    link.href = '../editor/index.html?mode=player';
  }
}

export function initSheet() {
  wireEvents();
  loadDimensions();
  renderLevelTable();
  applyEditorPayload();
  wireBackLink();
  recalcAll();
  refreshPowerCards();
}

// Sheet page calls initSheet() after inline DOM (skills, defenses, attacks) is built.
