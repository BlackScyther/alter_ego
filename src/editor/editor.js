import {
  createCharacter,
  touchCharacter,
  validateStep,
  isStepEnabled,
  pointBuySpent
} from '../character/model.js';
import {
  saveCharacter,
  loadCharacter,
  setActiveCharacterId,
  listCharacters,
  importCharacterDocument
} from '../character/store.js';
import { downloadCharacterJson, readCharacterJsonFile } from '../character/io.js';
import { compendium } from '../data/compendium.js';
import { stashCharacterForSheet } from '../character/sheet-bridge.js';
import { xpForLevel } from '../formulas.js';
import {
  ABILITY_KEYS,
  BONUS_TYPE_LABELS,
  TUTOR_GUIDE,
  ensureAbilityShape,
  syncBonusesFromSelections,
  setBonusEnabled,
  setAnyBonusAbility,
  setBaseScore,
  recomputeAbilityScores,
  recomputeSkillBonuses,
  tutorWarnings,
  formatBonusSummary,
  abilityScoreBreakdown,
  skillBonusBreakdown,
  formatBreakdownLine,
  formatSkillBreakdownLine
} from '../character/tutor.js';
import { renderBackgroundStep } from './steps/background-step.js';
import { renderFeatStep } from './steps/feat-step.js';
import { renderPowerStep } from './steps/power-step.js';
import {
  ensureFeatSelectionsShape,
  migrateFeatIdsToSelections,
  pruneFeatSelections
} from '../character/feat-selections.js';
import {
  ensurePowerSelectionsShape,
  migratePowerIdsToSelections,
  prunePowerSelections
} from '../character/power-selections.js';

const $ = (sel, root = document) => root.querySelector(sel);

let editorMeta = null;
let character = createCharacter();
let currentStepIndex = 0;
let completedSteps = new Set();
/** @type {'gate' | 'post-load' | 'create' | 'full'} */
let builderMode = 'gate';

async function loadEditorMeta() {
  const res = await fetch('../../metadata/editor.json');
  editorMeta = await res.json();
  return editorMeta;
}

function flow() {
  if (builderMode === 'create') return editorMeta.creationFlow ?? editorMeta.builderFlow;
  return editorMeta.builderFlow;
}

function setUiPhase(phase) {
  const gate = $('#generator-gate');
  const post = $('#generator-post-load');
  const wizard = $('#generator-wizard');
  const stepList = $('#step-list');
  const showGate = phase === 'gate';
  const showPost = phase === 'post-load';
  const showWizard = phase === 'create' || phase === 'full';
  gate?.classList.toggle('hidden', !showGate);
  gate?.classList.toggle('flex', showGate);
  post?.classList.toggle('hidden', !showPost);
  post?.classList.toggle('flex', showPost);
  wizard?.classList.toggle('hidden', !showWizard);
  wizard?.classList.toggle('flex', showWizard);
  if (stepList) {
    stepList.hidden = !showWizard;
  }
}

function updatePostLoadHeader() {
  const name = character.identity.characterName?.trim() || 'Unnamed';
  const lvl = character.identity.level;
  $('#post-load-title').textContent = name;
  $('#post-load-subtitle').textContent = `Level ${lvl} · ${character.identity.race || '—'} ${character.identity.class ? `/ ${character.identity.class}` : ''}`;
}

function enterPostLoad() {
  builderMode = 'post-load';
  setUiPhase('post-load');
  updatePostLoadHeader();
  refreshCharacterPicker();
  refreshGatePicker();
}

function startCreationFlow() {
  const player = character.identity.playerName;
  character = createCharacter();
  if (player) character.identity.playerName = player;
  completedSteps = new Set();
  currentStepIndex = 0;
  builderMode = 'create';
  setUiPhase('create');
  persist();
  refreshCharacterPicker();
  renderNav();
  renderStepPanel();
}

function startLevelUpFlow() {
  if (character.identity.level >= 30) {
    showErrors(['Already at maximum level (30).']);
    return;
  }
  character.identity.level += 1;
  character.identity.totalXp = xpForLevel(character.identity.level);
  ensureFeatSelectionsShape(character);
  pruneFeatSelections(character);
  ensurePowerSelectionsShape(character);
  prunePowerSelections(character);
  touchCharacter(character);
  completedSteps = new Set(['basics', 'race', 'background', 'class', 'abilities']);
  builderMode = 'full';
  const steps = flow();
  let idx = steps.indexOf('feats');
  if (idx < 0) idx = steps.indexOf('review');
  if (idx < 0) idx = 0;
  currentStepIndex = idx;
  setUiPhase('full');
  persist();
  renderNav();
  renderStepPanel();
  showErrors([`Level increased to ${character.identity.level}. Continue with feats and later steps.`]);
}

function returnToGate() {
  builderMode = 'gate';
  setUiPhase('gate');
  showErrors([]);
}

function currentStepId() {
  return flow()[currentStepIndex];
}

function renderNav() {
  const ul = $('#step-list');
  const lvl = character.identity.level;
  ul.innerHTML = '';
  flow().forEach((stepId, i) => {
    const def = editorMeta.steps[stepId];
    const enabled = isStepEnabled(stepId, lvl);
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = def?.title ?? stepId;
    btn.disabled = !enabled;
    if (i === currentStepIndex) btn.classList.add('active');
    if (completedSteps.has(stepId)) btn.classList.add('done');
    btn.addEventListener('click', () => goToStep(i));
    li.appendChild(btn);
    ul.appendChild(li);
  });
}

function showErrors(errors) {
  const box = $('#validation-errors');
  if (!errors.length) {
    box.innerHTML = '';
    box.hidden = true;
    return;
  }
  box.hidden = false;
  box.innerHTML = errors.map((e) => `<li>${esc(e)}</li>`).join('');
}

function goToStep(index) {
  const steps = flow();
  const lvl = character.identity.level;
  if (index < 0 || index >= steps.length) return;
  if (!isStepEnabled(steps[index], lvl)) return;
  currentStepIndex = index;
  renderNav();
  renderStepPanel();
}

async function renderStepPanel() {
  const stepId = currentStepId();
  const def = editorMeta.steps[stepId];
  $('#step-title').textContent = def.title;
  $('#step-subtitle').textContent = def.subtitle ?? '';

  const panel = $('#step-panel');
  panel.innerHTML = '';

  switch (stepId) {
    case 'basics':
      renderBasics(panel);
      break;
    case 'background':
      await renderBackgroundStep(panel, {
        character,
        compendium,
        def,
        applySelection: applyCompendiumSelection,
        getNotes: () => getNotesForStep('background'),
        setNotes: (text) => setNotesForStep('background', text),
        onPersist: async () => persist(),
        refreshBonuses: refreshBonusesFromSelections,
        renderTutorHint: (p) => renderSelectionTutorHint(p, 'background')
      });
      break;
    case 'race':
    case 'class':
    case 'theme':
    case 'paragon':
    case 'epic':
      await renderCompendiumStep(panel, stepId, def);
      break;
    case 'abilities':
      renderAbilities(panel);
      break;
    case 'feats':
      ensureFeatSelectionsShape(character);
      migrateFeatIdsToSelections(character);
      pruneFeatSelections(character);
      await renderFeatStep(panel, {
        character,
        compendium,
        def,
        onPersist: async () => persist(),
        refreshBonuses: refreshBonusesFromSelections,
        renderTutorHint: (p) => renderSelectionTutorHint(p, 'feats')
      });
      break;
    case 'powers':
      ensurePowerSelectionsShape(character);
      migratePowerIdsToSelections(character);
      prunePowerSelections(character);
      await renderPowerStep(panel, {
        character,
        compendium,
        def,
        onPersist: async () => persist(),
        renderTutorHint: (p) => renderSelectionTutorHint(p, 'powers')
      });
      break;
    case 'equipment':
      renderPlaceholder(panel, stepId);
      break;
    case 'review':
      renderReview(panel);
      break;
    default:
      panel.textContent = 'Step not implemented.';
  }

  showErrors([]);
}

function renderBasics(panel) {
  panel.innerHTML = `
    <div class="field-grid">
      <div class="field"><label>Player Name</label><input id="f-playerName" value="${esc(character.identity.playerName)}" /></div>
      <div class="field"><label>Character Name</label><input id="f-characterName" value="${esc(character.identity.characterName)}" /></div>
      <div class="field"><label>Level</label><input type="number" id="f-level" min="1" max="30" value="${character.identity.level}" /></div>
      <div class="field"><label>Alignment</label><input id="f-alignment" value="${esc(character.identity.alignment)}" /></div>
      <div class="field"><label>Deity</label><input id="f-deity" value="${esc(character.identity.deity)}" /></div>
      <div class="field"><label>Adventuring Company</label><input id="f-company" value="${esc(character.identity.company)}" /></div>
    </div>`;

  bind(panel, 'f-playerName', (v) => (character.identity.playerName = v));
  bind(panel, 'f-characterName', (v) => (character.identity.characterName = v));
  bind(panel, 'f-level', (v) => {
    character.identity.level = Math.min(30, Math.max(1, Number(v) || 1));
    character.identity.totalXp = xpForLevel(character.identity.level);
    ensureFeatSelectionsShape(character);
    pruneFeatSelections(character);
    ensurePowerSelectionsShape(character);
    prunePowerSelections(character);
    renderNav();
  });
  bind(panel, 'f-alignment', (v) => (character.identity.alignment = v));
  bind(panel, 'f-deity', (v) => (character.identity.deity = v));
  bind(panel, 'f-company', (v) => (character.identity.company = v));
}

function renderTutorGuide(panel, section) {
  const guide = TUTOR_GUIDE[section];
  if (!guide) return;
  const el = document.createElement('aside');
  el.className = 'tutor-guide';
  el.innerHTML = `<strong>${esc(guide.title)}</strong><p>${esc(guide.body)}</p>`;
  panel.prepend(el);
}

async function refreshBonusesFromSelections() {
  const entries = {};
  const map = [
    ['race', character.selections.raceId],
    ['class', character.selections.classId],
    ['background', character.selections.backgroundId],
    ['theme', character.selections.themeId]
  ];
  for (const [source, id] of map) {
    if (id) entries[source] = await compendium.getEntry(id);
  }
  const featEntries = [];
  const featIds = character.selections.featIds ?? [];
  for (const id of featIds) {
    const entry = await compendium.getEntry(id);
    if (entry) featEntries.push(entry);
  }
  ensureAbilityShape(character);
  syncBonusesFromSelections(character, entries, featEntries);
}

function renderAbilities(panel) {
  ensureAbilityShape(character);
  recomputeAbilityScores(character);
  recomputeSkillBonuses(character);
  const base = character.abilities.baseScores;
  const breakdown = abilityScoreBreakdown(character);
  const skillBreak = skillBonusBreakdown(character);
  const skillBonuses = character.skillBonuses ?? [];
  const { spent, remaining } = pointBuySpent(base);
  const over = remaining < 0;
  const warnings = tutorWarnings(character);
  const bonuses = character.abilities.bonuses ?? [];

  panel.innerHTML = `
    <div class="point-buy-status ${over ? 'over' : ''}">
      Point-buy (base): <strong>${spent}</strong> / 22 spent
      ${remaining >= 0 ? `(${remaining} remaining)` : `(${-remaining} over budget)`}
    </div>
    <p class="tutor-summary">${esc(formatBonusSummary(character))}</p>
    <div class="ability-grid ability-grid--dual">
      ${ABILITY_KEYS.map((a) => {
        const row = breakdown[a];
        const addsLabel = row.adds.length
          ? row.adds.map((x) => `+${x.amount} ${esc(x.typeLabel)}`).join(' ')
          : '';
        return `
        <div class="field">
          <label>${a.toUpperCase()} base</label>
          <input type="number" id="abil-${a}" min="8" max="18" value="${row.base}" />
          ${addsLabel ? `<div class="abil-adds">${addsLabel}</div>` : ''}
        </div>`;
      }).join('')}
    </div>
    <section class="ability-end-result" aria-label="End result ability scores">
      <h3 class="tutor-bonuses-title">End result (held for character sheet)</h3>
      <div class="end-result-grid">
        ${ABILITY_KEYS.map((a) => {
          const row = breakdown[a];
          return `
          <div class="end-result-cell">
            <span class="end-result-label">${a.toUpperCase()}</span>
            <span class="end-result-value" id="abil-final-${a}">${row.total}</span>
            <span class="end-result-formula">${esc(formatBreakdownLine(a, breakdown))}</span>
          </div>`;
        }).join('')}
      </div>
    </section>
    <section class="tutor-bonuses" id="tutor-bonuses"></section>
    <section class="tutor-bonuses" id="tutor-skill-bonuses"></section>
    <ul class="tutor-warnings" id="tutor-warnings" ${warnings.length ? '' : 'hidden'}></ul>`;

  renderTutorGuide(panel, 'abilityBonuses');
  const skillGuide = document.createElement('aside');
  skillGuide.className = 'tutor-guide tutor-guide--compact';
  skillGuide.innerHTML = `<strong>${esc(TUTOR_GUIDE.skillBonuses.title)}</strong><p>${esc(TUTOR_GUIDE.skillBonuses.body)}</p>`;
  panel.querySelector('#tutor-skill-bonuses').before(skillGuide);

  const itemNote = document.createElement('p');
  itemNote.className = 'tutor-footnote';
  itemNote.textContent = TUTOR_GUIDE.itemBonuses.body;
  panel.appendChild(itemNote);

  renderBonusTable(panel.querySelector('#tutor-bonuses'), {
    title: 'Ability bonuses',
    empty:
      'Select race, class, or theme for ability bonuses. Same type on one ability does not stack; different types do.',
    rows: bonuses,
    kind: 'ability'
  });

  renderBonusTable(panel.querySelector('#tutor-skill-bonuses'), {
    title: 'Skill bonuses',
    empty:
      'Select background and feats with skill bonuses. Two Skill-type bonuses on one skill do not add; Skill + Feat do.',
    rows: skillBonuses,
    kind: 'skill',
    breakdown: skillBreak
  });

  const warnEl = panel.querySelector('#tutor-warnings');
  if (warnings.length) {
    warnEl.hidden = false;
    warnEl.innerHTML = warnings.map((w) => `<li>${esc(w)}</li>`).join('');
  }

  for (const a of ABILITY_KEYS) {
    bind(panel, `abil-${a}`, (v) => {
      setBaseScore(character, a, v);
      renderAbilities(panel);
    });
  }
}

function renderBonusTable(container, { title, empty, rows, kind, breakdown }) {
  if (!rows.length) {
    container.innerHTML = `<p class="tutor-empty">${empty}</p>`;
    return;
  }
  container.innerHTML = `<h3 class="tutor-bonuses-title">${esc(title)}</h3>
    <table class="bonus-table"><thead><tr>
      <th></th><th>Source</th><th>Type</th><th>Target</th><th>Note</th>
    </tr></thead><tbody id="bonus-rows-${kind}"></tbody></table>`;
  const tbody = container.querySelector(`#bonus-rows-${kind}`);
  for (const b of rows) {
    const tr = document.createElement('tr');
    const typeLabel = BONUS_TYPE_LABELS[b.bonusType] ?? b.bonusType;
    let targetCell = '';
    if (kind === 'ability') {
      targetCell =
        b.ability === 'any'
          ? `<select id="bonus-any-${b.id}" ${b.enabled ? '' : 'disabled'}>
              ${ABILITY_KEYS.map(
                (k) =>
                  `<option value="${k}" ${character.abilities.anyChoice?.[b.id] === k ? 'selected' : ''}>${k.toUpperCase()} +${b.amount}</option>`
              ).join('')}
            </select>`
          : `${b.ability.toUpperCase()} +${b.amount}`;
    } else {
      const line = breakdown?.[b.skill];
      targetCell = `${b.skill} +${b.amount}${line?.total ? ` <span class="meta">(→ +${line.total} on sheet)</span>` : ''}`;
    }
    tr.innerHTML = `
      <td><input type="checkbox" data-bonus-id="${esc(b.id)}" ${b.enabled ? 'checked' : ''} /></td>
      <td>${esc(b.sourceName)} <span class="meta">(${b.source})</span></td>
      <td>${esc(typeLabel)}</td>
      <td>${targetCell}</td>
      <td class="bonus-note">${esc(b.note)}</td>`;
    tbody.appendChild(tr);
    tr.querySelector('input[type=checkbox]').addEventListener('change', (e) => {
      setBonusEnabled(character, b.id, e.target.checked, kind);
      renderAbilities(container.closest('#step-panel') ?? document.getElementById('step-panel'));
      persist();
    });
    const anySel = tr.querySelector(`#bonus-any-${b.id}`);
    if (anySel) {
      anySel.addEventListener('change', (e) => {
        setAnyBonusAbility(character, b.id, e.target.value);
        renderAbilities(container.closest('#step-panel') ?? document.getElementById('step-panel'));
        persist();
      });
    }
  }
  if (breakdown && kind === 'skill') {
    const active = Object.entries(breakdown).filter(([, row]) => row.total > 0);
    if (active.length) {
      const dl = document.createElement('dl');
      dl.className = 'skill-stack-summary';
      for (const [skillId, row] of active) {
        const dt = document.createElement('dt');
        dt.textContent = skillId;
        const dd = document.createElement('dd');
        dd.textContent = formatSkillBreakdownLine(skillId, breakdown);
        dl.appendChild(dt);
        dl.appendChild(dd);
      }
      container.appendChild(dl);
    }
  }
}

function renderSelectionTutorHint(panel, stepId) {
  const meta = editorMeta?.tutor;
  if (!meta) return;
  const hint = document.createElement('p');
  hint.className = 'tutor-inline';
  if (stepId === 'background') {
    hint.textContent = meta.skillBonuses ?? meta.abilityBonuses;
  } else if (stepId === 'feats') {
    hint.textContent = meta.skillBonuses ?? meta.abilityBonuses;
  } else if (['race', 'class', 'theme'].includes(stepId)) {
    hint.textContent = meta.abilityBonuses;
  }
  if (hint.textContent) panel.prepend(hint);
}

async function renderCompendiumStep(panel, stepId, def) {
  const cat = def.compendiumCategory;
  const selectedId = getSelectionIdForStep(stepId);

  panel.innerHTML = `
    <div class="compendium-picker" data-category="${cat}">
      <div class="picker-toolbar">
        <input type="search" id="picker-search" placeholder="Search ${def.title}…" />
      </div>
      <div class="picker-list" id="picker-list"></div>
      <div class="entry-preview" id="entry-preview"></div>
    </div>
    <div class="field" style="margin-top:12px">
      <label>Notes (features text)</label>
      <textarea id="step-notes" rows="4">${esc(getNotesForStep(stepId))}</textarea>
    </div>`;

  const listEl = panel.querySelector('#picker-list');
  const preview = panel.querySelector('#entry-preview');
  const search = panel.querySelector('#picker-search');

  async function refresh(q = '') {
    const entries = await compendium.listEntries(cat, { search: q, limit: 100 });
    listEl.innerHTML = entries
      .map((e) => {
        const name = e.listing_fields?.Name ?? e.id;
        const meta = formatListingMeta(e.listing_fields, def.compendiumCategory);
        const sel = e.id === selectedId ? 'selected' : '';
        return `<button type="button" class="picker-btn w-full min-h-11 rounded-lg border border-slate-600 bg-slate-800 px-4 py-3 text-left text-base font-medium text-slate-100 hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${sel ? 'ring-2 ring-amber-500/80' : ''}" data-id="${e.id}">
          <span class="block">${esc(name)}</span>
          <span class="block text-sm font-normal text-slate-400">${esc(meta)}</span>
        </button>`;
      })
      .join('');

    listEl.className = 'picker-list flex flex-col gap-2 w-full max-w-xl';
    listEl.querySelectorAll('.picker-btn').forEach((row) => {
      row.addEventListener('click', async () => {
        const entry = await compendium.getEntry(row.dataset.id);
        applyCompendiumSelection(stepId, entry);
        await refreshBonusesFromSelections();
        listEl.querySelectorAll('.picker-btn').forEach((r) => {
          r.classList.remove('ring-2', 'ring-amber-500/80');
        });
        row.classList.add('ring-2', 'ring-amber-500/80');
        preview.innerHTML = entry?.body_html ?? '';
        panel.querySelector('#step-notes').value = getNotesForStep(stepId);
        persist();
      });
    });

    if (selectedId) {
      const entry = await compendium.getEntry(selectedId);
      preview.innerHTML = entry?.body_html ?? '';
    }
  }

  search.addEventListener('input', () => refresh(search.value));
  panel.querySelector('#step-notes').addEventListener('input', (e) => {
    setNotesForStep(stepId, e.target.value);
    persist();
  });

  renderSelectionTutorHint(panel, stepId);
  await refresh();
}

function renderPlaceholder(panel, stepId) {
  const def = editorMeta.steps[stepId];
  panel.innerHTML = `
    <p style="color:var(--editor-muted)">
      <strong>${def.title}</strong> — framework placeholder. Compendium category
      <code>${def.compendiumCategory ?? def.compendiumCategories?.join(', ')}</code>
      will connect after full DB import and rules engine.
    </p>`;
}

function renderReview(panel) {
  const id = character.identity;
  panel.innerHTML = `
    <p style="color:var(--editor-muted);font-size:13px;margin:0 0 12px">
      Use <strong>Export JSON</strong> in the toolbar to save <code>Name_level.json</code> for the GM party folder.
    </p>
    <dl class="review-summary">
      <dt>Character</dt><dd>${esc(id.characterName)} (Lv ${id.level}) — ${esc(id.playerName)}</dd>
      <dt>Race / Class</dt><dd>${esc(id.race)} ${id.class ? `/ ${esc(id.class)}` : ''}</dd>
      <dt>Abilities (final)</dt><dd>${formatScores(character.abilities.scores)}</dd>
      <dt>Point-buy base</dt><dd>${formatScores(character.abilities.baseScores ?? character.abilities.scores)}</dd>
      <dt>Bonuses</dt><dd>${esc(formatBonusSummary(character))}</dd>
      <dt>Selections</dt><dd>${formatSelections(character.selections)}</dd>
      <dt>Compendium</dt><dd>${esc(JSON.stringify(compendium.getStatus()))}</dd>
    </dl>`;
}

function formatScores(scores) {
  return Object.entries(scores)
    .map(([k, v]) => `${k.toUpperCase()} ${v}`)
    .join(', ');
}

function formatSelections(sel) {
  const parts = [];
  if (sel.raceId) parts.push(`race: ${sel.raceId}`);
  if (sel.classId) parts.push(`class: ${sel.classId}`);
  if (sel.featIds?.length) parts.push(`feats: ${sel.featIds.length}`);
  if (sel.powerIds?.length) parts.push(`powers: ${sel.powerIds.length}`);
  return parts.join(' · ') || '—';
}

function getSelectionIdForStep(stepId) {
  const map = {
    race: 'raceId',
    class: 'classId',
    background: 'backgroundId',
    theme: 'themeId',
    paragon: 'paragonPathId',
    epic: 'epicDestinyId'
  };
  return character.selections[map[stepId]];
}

function getNotesForStep(stepId) {
  if (stepId === 'race') return character.notes.raceFeatures;
  if (stepId === 'class') return character.notes.classFeatures;
  if (stepId === 'background') return character.notes.backgroundFeatures ?? '';
  return '';
}

function setNotesForStep(stepId, text) {
  if (stepId === 'race') character.notes.raceFeatures = text;
  if (stepId === 'class') character.notes.classFeatures = text;
  if (stepId === 'background') character.notes.backgroundFeatures = text;
}

function applyCompendiumSelection(stepId, entry) {
  if (!entry) return;
  const name = entry.listing_fields?.Name ?? entry.id;
  switch (stepId) {
    case 'race':
      character.selections.raceId = entry.id;
      character.identity.race = name;
      character.identity.size = entry.listing_fields?.Size ?? character.identity.size;
      if (!character.notes.raceFeatures) {
        character.notes.raceFeatures = stripHtml(entry.body_html);
      }
      if (document.querySelector('.compendium-picker[data-category="background"]')) {
        const search = document.querySelector('#picker-search');
        search?.dispatchEvent(new Event('input', { bubbles: true }));
      }
      break;
    case 'class':
      character.selections.classId = entry.id;
      character.identity.class = name;
      character.identity.role = entry.listing_fields?.RoleName ?? '';
      if (!character.notes.classFeatures) {
        character.notes.classFeatures = stripHtml(entry.body_html);
      }
      break;
    case 'background':
      character.selections.backgroundId = entry.id;
      character.identity.background = name;
      break;
    case 'theme':
      character.selections.themeId = entry.id;
      break;
    case 'paragon':
      character.selections.paragonPathId = entry.id;
      character.identity.paragonPath = name;
      break;
    case 'epic':
      character.selections.epicDestinyId = entry.id;
      character.identity.epicDestiny = name;
      break;
  }
}

function stripHtml(html) {
  const d = document.createElement('div');
  d.innerHTML = html ?? '';
  return d.textContent.trim();
}

function formatListingMeta(fields, category) {
  if (!fields) return '';
  const keys = {
    race: ['Origin', 'Size'],
    class: ['RoleName', 'PowerSourceText'],
    feat: ['Tier', 'Prerequisite'],
    paragonpath: ['Prerequisite'],
    epicdestiny: ['Prerequisite']
  }[category] ?? ['SourceBook'];
  return keys.map((k) => fields[k]).filter(Boolean).join(' · ');
}

function bind(root, id, setter) {
  const el = root.querySelector(`#${id}`);
  if (!el) return;
  const handler = () => {
    setter(el.value);
    persist();
  };
  el.addEventListener('input', handler);
  el.addEventListener('change', handler);
}

function persist() {
  character = touchCharacter(character);
  saveCharacter(character);
  setActiveCharacterId(character.id);
  refreshCharacterPicker();
}

function fillCharacterSelect(select, { placeholder = '(none saved)' } = {}) {
  if (!select) return;
  const list = listCharacters();
  const prev = select.value;
  select.innerHTML = '';
  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = list.length ? '— Select —' : placeholder;
  select.appendChild(empty);
  for (const c of list) {
    const opt = document.createElement('option');
    opt.value = c.id;
    const name = c.identity?.characterName || 'Unnamed';
    const lvl = c.identity?.level ?? '?';
    opt.textContent = `${name} (Lv ${lvl})`;
    if (c.id === character.id) opt.selected = true;
    select.appendChild(opt);
  }
  if (prev && list.some((c) => c.id === prev)) select.value = prev;
}

function refreshCharacterPicker() {
  fillCharacterSelect($('#char-picker'));
}

function refreshGatePicker() {
  fillCharacterSelect($('#gate-char-picker'), { placeholder: '(no saved characters yet)' });
}

async function switchToCharacter(id) {
  if (!id) return;
  const loaded = loadCharacter(id);
  if (!loaded) return;
  character = loaded;
  setActiveCharacterId(character.id);
  ensureFeatSelectionsShape(character);
  migrateFeatIdsToSelections(character);
  ensureAbilityShape(character);
  recomputeAbilityScores(character);
  await refreshBonusesFromSelections();
  completedSteps = new Set();
  currentStepIndex = 0;
  refreshCharacterPicker();
  refreshGatePicker();
  if (builderMode === 'gate' || builderMode === 'post-load') {
    enterPostLoad();
    return;
  }
  renderNav();
  renderStepPanel();
}

function exportCharacterFile() {
  persist();
  const filename = downloadCharacterJson(character);
  showErrors([`Exported ${filename}`]);
}

async function importCharacterFile(file) {
  if (!file) return;
  try {
    const doc = await readCharacterJsonFile(file);
    character = importCharacterDocument(doc, { forceNewId: false });
    setActiveCharacterId(character.id);
    ensureFeatSelectionsShape(character);
    migrateFeatIdsToSelections(character);
    ensureAbilityShape(character);
    recomputeAbilityScores(character);
    await refreshBonusesFromSelections();
    completedSteps = new Set();
    currentStepIndex = 0;
    renderNav();
    renderStepPanel();
    refreshCharacterPicker();
    refreshGatePicker();
    if (builderMode === 'gate') {
      enterPostLoad();
      showErrors([`Imported ${file.name}`]);
      return;
    }
    showErrors([`Imported ${file.name}`]);
  } catch (err) {
    showErrors([err.message ?? String(err)]);
  }
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

async function nextStep() {
  const stepId = currentStepId();
  const errors = validateStep(stepId, character, editorMeta);
  if (errors.length) {
    showErrors(errors);
    return;
  }
  completedSteps.add(stepId);
  showErrors([]);
  if (currentStepIndex < flow().length - 1) {
    let next = currentStepIndex + 1;
    const lvl = character.identity.level;
    while (next < flow().length && !isStepEnabled(flow()[next], lvl)) next++;
    goToStep(next);
  }
  persist();
}

function prevStep() {
  if (currentStepIndex > 0) goToStep(currentStepIndex - 1);
}

function openSheet() {
  const errors = [];
  if (builderMode !== 'create') {
    errors.push(...validateStep('basics', character, editorMeta));
  } else if (!character.identity.characterName?.trim()) {
    character.identity.characterName = 'New Character';
  }
  if (!character.selections.raceId || !character.selections.classId) {
    errors.push('Complete at least Race and Class before opening the sheet.');
  }
  if (errors.length) {
    showErrors(errors);
    return;
  }
  persist();
  stashCharacterForSheet(character);
  const sheetHref = '../sheet/index.html?from=editor';
  // #region agent log
  debugClientLog('openSheet navigate', { from: location.pathname, to: sheetHref }, 'B');
  // #endregion
  window.location.href = sheetHref;
}

function debugClientLog(message, data, hypothesisId) {
  // #region agent log
  fetch('http://127.0.0.1:7737/ingest/957dca39-ea8e-420d-92ba-58809ca18a8c', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '5d39f7' },
    body: JSON.stringify({
      sessionId: '5d39f7',
      runId: 'pre-fix',
      hypothesisId,
      location: 'src/editor/editor.js:init',
      message,
      data,
      timestamp: Date.now()
    })
  }).catch(() => {});
  // #endregion
}

async function init() {
  // #region agent log
  debugClientLog('editor init', { pathname: location.pathname, search: location.search }, 'A');
  // #endregion
  await loadEditorMeta();
  await compendium.ready();

  const params = new URLSearchParams(location.search);
  const loadId = params.get('id');
  if (loadId) {
    const loaded = loadCharacter(loadId);
    if (loaded) {
      character = loaded;
      builderMode = 'full';
    }
  } else {
    character = createCharacter();
    builderMode = 'gate';
  }

  const status = compendium.getStatus();
  $('#compendium-status').textContent =
    status.mode === 'stub'
      ? 'Compendium: sample data (import DB for full rules)'
      : `Compendium: ${status.mode}`;
  $('#compendium-status').classList.toggle('mode-stub', status.mode === 'stub');

  ensureAbilityShape(character);
  recomputeAbilityScores(character);
  await refreshBonusesFromSelections();

  if (builderMode === 'full') {
    setUiPhase('full');
    renderNav();
    renderStepPanel();
  } else {
    setUiPhase('gate');
  }
  refreshCharacterPicker();
  refreshGatePicker();

  $('#char-picker')?.addEventListener('change', (e) => switchToCharacter(e.target.value));
  $('#gate-char-picker')?.addEventListener('change', (e) => switchToCharacter(e.target.value));
  $('#gate-import')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) importCharacterFile(file);
    e.target.value = '';
  });
  $('#btn-export')?.addEventListener('click', exportCharacterFile);
  $('#btn-import')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) importCharacterFile(file);
    e.target.value = '';
  });

  $('#btn-level-up')?.addEventListener('click', startLevelUpFlow);
  $('#btn-new-build')?.addEventListener('click', startCreationFlow);
  $('#btn-back-to-load')?.addEventListener('click', returnToGate);

  $('#btn-next').addEventListener('click', nextStep);
  $('#btn-prev').addEventListener('click', prevStep);
  $('#btn-save').addEventListener('click', () => {
    persist();
    showErrors(['Character saved locally.']);
  });
  $('#btn-sheet').addEventListener('click', openSheet);
}

init();
