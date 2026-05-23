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

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function num(id) {
  const el = document.getElementById(id);
  if (!el) return 0;
  return Number(el.value) || 0;
}

function setCalc(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  const v = Number(value);
  el.value = Number.isFinite(v) ? (Number.isInteger(v) ? v : v) : '';
  if (el.dataset) el.dataset.value = String(v);
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
    const trained = $(`#skill-${skill.id}-trained`)?.checked ?? false;
    const misc = num(`skill-${skill.id}-misc`);
    const pen = skill.armorPenalty ? globalArmor + num(`skill-${skill.id}-pen`) : num(`skill-${skill.id}-pen`);
    const bonus = skillBonus(scores[skill.ability], lvl, trained, pen, misc);
    setCalc(`skill-${skill.id}-bonus`, bonus);
    setCalc(`skill-${skill.id}-mod-half`, modPlusHalfLevel(scores[skill.ability], lvl));
  }

  setCalc('passive-insight', passiveSense(num('skill-insight-bonus') || getSkillBonusDisplay('insight')));
  setCalc('passive-perception', passiveSense(num('skill-perception-bonus') || getSkillBonusDisplay('perception')));
}

function getSkillBonusDisplay(skillId) {
  const el = document.getElementById(`skill-${skillId}-bonus`);
  return el ? Number(el.value) || 0 : 0;
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
    setCalc(
      `${kind}-atk-total`,
      attackBonus(lvl, {
        abil: num(`${kind}-atk-abil`),
        class: num(`${kind}-atk-class`),
        prof: num(`${kind}-atk-prof`),
        feat: num(`${kind}-atk-feat`),
        enh: num(`${kind}-atk-enh`),
        misc: num(`${kind}-atk-misc`)
      })
    );
    setCalc(
      `${kind}-dmg-total`,
      damageBonus({
        abil: num(`${kind}-dmg-abil`),
        feat: num(`${kind}-dmg-feat`),
        enh: num(`${kind}-dmg-enh`),
        misc: num(`${kind}-dmg-misc`),
        misc2: num(`${kind}-dmg-misc2`)
      })
    );
  });
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
        meta.textContent = `Page ${d.page.widthIn}" × ${d.page.heightIn}" (content ${d.page.contentWidthIn}" × ${d.page.contentHeightIn}")`;
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

function wireEvents() {
  $$('input, textarea, select').forEach((el) => {
    el.addEventListener('input', recalcAll);
    el.addEventListener('change', recalcAll);
  });

  $('#scale-slider')?.addEventListener('input', (e) => {
    applyScale(Number(e.target.value) / 100);
  });

  $('#btn-print')?.addEventListener('click', () => window.print());
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
      const el = document.getElementById(fieldId);
      if (!el || value === undefined || value === null) continue;
      if (el.type === 'checkbox') el.checked = Boolean(value);
      else el.value = value;
    }
    recalcAll();
  } catch {
    /* ignore */
  }
}

export function initSheet() {
  wireEvents();
  loadDimensions();
  renderLevelTable();
  applyEditorPayload();
  recalcAll();
}

// Sheet page calls initSheet() after inline DOM (skills, defenses, attacks) is built.
