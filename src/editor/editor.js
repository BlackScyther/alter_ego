import {
  createCharacter,
  touchCharacter,
  validateStep,
  isStepEnabled,
  pointBuySpent,
  autoPointBuy
} from '../character/model.js';
import { focusPendingChoice } from './choice-guide.js';
import {
  saveCharacter,
  loadCharacter,
  setActiveCharacterId,
  listCharacters,
  importCharacterDocument,
  deleteCharacter
} from '../character/store.js';
import { initBuildStamp } from '../shared/build-stamp.js';
import {
  applyPlayerNav,
  enablePlayerMode,
  isPlayerMode,
  syncPlayerModeFromUrl,
  withPlayerMode
} from '../player-mode.js';
import { getSessionCampaign, isPlayerSession, saveCharacterToCampaign } from '../api/campaign-api.js';
import { downloadCharacterJson, readCharacterJsonFile } from '../character/io.js';
import { compendium } from '../data/compendium.js';
import { stashCharacterForSheet } from '../character/sheet-bridge.js';
import { raceBonusEntryId, hydrateSubracesFromProvider } from '../character/race-subraces.js';
import { xpForLevel } from '../formulas.js';
import { canLevelUp, levelUpTooltip, retrainingBuilderStart } from './post-load.js';
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
  bonusesForTutorTable,
  formatBonusSummary,
  abilityScoreBreakdown,
  skillBonusBreakdown,
  formatBreakdownLine,
  formatSkillBreakdownLine,
  syncRaceBonusChoicesToBonuses,
  ASI_PAIR_LEVELS,
  ASI_ALL_LEVELS,
  setLevelIncrease,
  pendingAbilityIncreaseLevels
} from '../character/tutor.js';
import { renderBackgroundStep } from './steps/background-step.js';
import { renderFeatStep } from './steps/feat-step.js';
import { renderPowerStep } from './steps/power-step.js';
import { renderEquipmentStep } from './steps/equipment-step.js';
import { renderRaceStep } from './steps/race-step.js';
import { renderClassStep } from './steps/class-step.js';
import { ensureRaceSelectionsShape } from '../character/race-selections.js';
import { resetBackgroundBonusChoices } from '../character/background-selections.js';
import { parseBackgroundEntry, buildBackgroundNotesText } from '../character/background-parse.js';
import { getHpSubstituteTutorHint } from '../character/hp.js';
import { buildCompendiumLinkIndex } from '../data/compendium-link-index.js';
import { attachCompendiumHoverDelegates } from '../ui/compendium-hover-card.js';
import { renderLinkedEntryPreview } from '../ui/compendium-links.js';
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
import {
  ensureEquipmentSelectionsShape,
  migrateEquipmentIdsToItems
} from '../character/equipment-selections.js';
import { syncEquipmentToSheet } from '../character/equipment-sheet-sync.js';
import {
  applySheetValueToCharacter,
  buildMirrorPayload,
  initSheetMirror,
  renderSheetMirror,
  setSheetMirrorVisible
} from './sheet-mirror.js';
import {
  attachSkillsTableHandlers,
  getSkillFieldMap,
  populateSkillsTable,
  renderSkillsTableHtml
} from './skills-table.js';
import { syncCollectionNotes } from '../character/character-collection.js';
import {
  renderCharacterCollectionPanel,
  initCharacterCollectionPanel
} from './steps/character-collection-panel.js';
import { loadUniversalActionsMeta } from './steps/power-collection-panel.js';
import { openPrintCardsDialog } from './print-cards-dialog.js';
import {
  ensureRitualSelectionsShape,
  pruneRitualSelections,
  setRitualForSlot,
  syncGrantedRitualIds
} from '../character/ritual-selections.js';
import {
  getClassTrainedSkillCheckboxState,
  syncClassNotesAndGrants,
  toggleClassTrainedSkill,
  getRecommendedAbilityPriorities
} from '../character/class-selections.js';
import {
  renderComboboxHtml,
  attachComboboxBehavior,
  renderPickerOptions,
  setComboboxInputFromEntry,
  showEmptyHint,
  COMPENDIUM_SEARCH_MIN
} from './picker/combobox-picker.js';

const $ = (sel, root = document) => root.querySelector(sel);

let editorMeta = null;
let character = createCharacter();
let currentStepIndex = 0;
let completedSteps = new Set();
/** @type {import('../data/compendium-link-index.js').buildCompendiumLinkIndex extends (...args: any) => Promise<infer R> ? R : never} */
let linkIndex = { terms: [], byName: new Map() };
/** @type {'gate' | 'identity-setup' | 'post-load' | 'create' | 'full'} */
let builderMode = 'gate';
/** @type {string | null} */
let activePowerSlotId = null;
/** @type {string | null} */
let activeFeatSlotId = null;
/** @type {string | null} */
let activeRitualSlotId = null;
/** @type {object | null} */
let cachedClassEntry = null;
/** @type {import('./picker/combobox-picker.js').ComboboxController | null} */
let ritualCombobox = null;

const EDITOR_RETURN_KEY = 'dnd4e.editorReturn';

async function loadEditorMeta() {
  let res;
  try {
    res = await fetch('../../metadata/editor.json');
  } catch (err) {
    throw new Error(`Could not reach the generator configuration (metadata/editor.json): ${err?.message ?? err}`);
  }
  if (!res.ok) {
    throw new Error(`Could not load the generator configuration (metadata/editor.json): HTTP ${res.status}.`);
  }
  try {
    editorMeta = await res.json();
  } catch {
    // A 200 that is not JSON is almost always the host's HTML fallback page,
    // i.e. metadata/ was not deployed next to the app.
    throw new Error('The generator configuration (metadata/editor.json) was not valid JSON. On a deployed site, make sure the metadata/ and data/ folders are uploaded next to the app.');
  }
  return editorMeta;
}

function flow() {
  if (builderMode === 'create') return editorMeta.creationFlow ?? editorMeta.builderFlow;
  return editorMeta.builderFlow;
}

function setUiPhase(phase) {
  const gate = $('#generator-gate');
  const identity = $('#generator-identity-setup');
  const post = $('#generator-post-load');
  const wizard = $('#generator-wizard');
  const stepList = $('#step-list');
  const showGate = phase === 'gate';
  const showIdentity = phase === 'identity-setup';
  const showPost = phase === 'post-load';
  const showWizard = phase === 'create' || phase === 'full';
  gate?.classList.toggle('hidden', !showGate);
  gate?.classList.toggle('flex', showGate);
  identity?.classList.toggle('hidden', !showIdentity);
  identity?.classList.toggle('flex', showIdentity);
  post?.classList.toggle('hidden', !showPost);
  post?.classList.toggle('flex', showPost);
  wizard?.classList.toggle('hidden', !showWizard);
  wizard?.classList.toggle('flex', showWizard);
  if (stepList) {
    stepList.hidden = !showWizard;
  }
  setSheetMirrorVisible(showWizard);
  setCharacterCollectionVisible(showWizard);
  if (showWizard) {
    renderSheetMirror(character);
    refreshCharacterCollection();
  }
}

/**
 * @param {boolean} visible
 */
function setCharacterCollectionVisible(visible) {
  const panel = $('#character-collection-panel');
  if (!panel) return;
  panel.classList.toggle('hidden', !visible);
}

async function refreshCharacterCollection() {
  const panel = $('#character-collection-panel');
  if (!panel || panel.classList.contains('hidden')) return;
  const body = panel.querySelector('.character-collection-body');
  const preview = $('#character-collection-preview');
  if (!body) return;

  const hostEl = body.querySelector('.character-collection-cards-host');
  if (!hostEl) return;
  const universalMeta = await loadUniversalActionsMeta();

  await renderCharacterCollectionPanel(hostEl, {
    character,
    compendium,
    linkIndex,
    universalMeta,
    activeSlotId: currentStepId() === 'feats' ? activeFeatSlotId : activePowerSlotId,
    onPreview: () => {
      if (preview) preview.classList.add('hidden');
    },
    onActivateSlot: (slotId) => {
      if (String(slotId).startsWith('feat-')) {
        activeFeatSlotId = slotId;
        if (currentStepId() === 'feats') {
          document.querySelector(`.power-slot-row[data-slot-id="${slotId}"]`)?.click();
        }
        refreshCharacterCollection();
        return;
      }
      activePowerSlotId = slotId;
      const powerStep = flow().includes('powers') && currentStepId() === 'powers';
      if (!powerStep) return;
      const row = document.querySelector(`.power-slot-row[data-slot-id="${slotId}"]`);
      row?.click();
      refreshCharacterCollection();
    },
    onActivateRitualSlot: (slotId) => {
      activeRitualSlotId = slotId;
      showRitualPicker(slotId);
    },
    onPrintCards: () => openPrintCards()
  });
}

/** Map rendered collection-section titles to print-card category keys. */
const PRINT_CARD_SECTION_KEYS = {
  Powers: 'powers',
  Feats: 'feats',
  Rituals: 'rituals'
};

/** Which card categories the current character actually has rendered. */
function availablePrintCardCategories() {
  const panel = $('#character-collection-panel');
  const titles = panel
    ? Array.from(panel.querySelectorAll('.character-collection-section .power-collection-group-title'))
    : [];
  const keys = [];
  for (const el of titles) {
    const key = PRINT_CARD_SECTION_KEYS[(el.textContent ?? '').trim()];
    if (key && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

/**
 * Let the player choose which categories to print, then hand off the current
 * working character (plus the chosen categories) to the printable rule-cards
 * page and open it in a new tab. The card page reads (and clears) the handoff
 * so it prints exactly what the player has built, including unsaved changes.
 */
async function openPrintCards() {
  const available = availablePrintCardCategories();
  const categories = await openPrintCardsDialog(available);
  if (categories === null) return;

  try {
    localStorage.setItem('editor.printCards', JSON.stringify({ character, categories }));
  } catch {
    /* fall back to the active stored character on the cards page */
  }
  const url = new URL('../print/cards.html', location.href);
  window.open(url.href, '_blank', 'noopener');
}

function showRitualPicker(slotId) {
  const panel = $('#character-collection-panel');
  const pickerHost = panel?.querySelector('#character-collection-ritual-picker');
  if (!pickerHost) return;
  pickerHost.classList.remove('hidden');
  pickerHost.dataset.slotId = slotId;
  refreshRitualPicker(slotId, '');
}

async function refreshRitualPicker(slotId, query = '') {
  const panel = $('#character-collection-panel');
  const listbox = panel?.querySelector('#picker-listbox-ritual');
  const input = panel?.querySelector('#picker-ritual');
  if (!listbox || !input) return;

  const level = character.identity?.level ?? 1;
  const q = query.trim();
  const entries = await compendium.listEntries('ritual', {
    search: q.length >= COMPENDIUM_SEARCH_MIN ? q : '',
    limit: 100
  });
  const exclude = new Set(character.selections.ritualIds ?? []);
  const filtered = entries.filter((e) => {
    const ritualLevel = parseInt(String(e.listing_fields?.Level ?? ''), 10);
    if (!Number.isNaN(ritualLevel) && ritualLevel > level) return false;
    return !exclude.has(e.id);
  });

  const selectedId = character.selections.ritualSelections?.[slotId] ?? null;
  if (!filtered.length) {
    showEmptyHint(listbox, 'No matching rituals.');
    return;
  }

  renderPickerOptions(listbox, filtered.slice(0, 100), selectedId, async (id) => {
    const entry = await compendium.getEntry(id);
    if (!entry) return;
    setRitualForSlot(character, slotId, id);
    await syncCollectionNotes(character, compendium);
    await persist();
    input.value = entry.listing_fields?.Name ?? id;
    ritualCombobox?.closeDropdown();
    await refreshCharacterCollection();
    await refreshBonusesFromSelections();
  }, (e) => {
    const parts = [e.listing_fields?.Level ? `Level ${e.listing_fields.Level}` : '', e.listing_fields?.SourceBook].filter(Boolean);
    return parts.join(' · ');
  });
}

function updatePostLoadHeader() {
  const name = character.identity.characterName?.trim() || 'Unnamed';
  const lvl = character.identity.level;
  $('#post-load-title').textContent = name;
  $('#post-load-subtitle').textContent = `Level ${lvl} · ${character.identity.race || '—'} ${character.identity.class ? `/ ${character.identity.class}` : ''}`;
}

function refreshPostLoadActions() {
  const levelUpBtn = $('#btn-level-up');
  const wrap = $('#btn-level-up-wrap');
  if (!levelUpBtn) return;
  const allowed = canLevelUp(character);
  levelUpBtn.disabled = !allowed;
  const tooltip = levelUpTooltip(character);
  if (wrap) {
    wrap.title = allowed ? '' : tooltip;
    wrap.classList.toggle('post-load-cta-wrap--disabled', !allowed);
    if (!allowed && tooltip) {
      wrap.setAttribute('aria-label', tooltip);
    } else {
      wrap.removeAttribute('aria-label');
    }
  }
}

function enterPostLoad() {
  builderMode = 'post-load';
  setUiPhase('post-load');
  updatePostLoadHeader();
  refreshPostLoadActions();
  refreshCharacterPicker();
  refreshGatePicker();
}

function enterIdentitySetup() {
  builderMode = 'identity-setup';
  setUiPhase('identity-setup');
  const nameInput = $('#identity-character-name');
  if (nameInput) {
    nameInput.value = '';
    updateIdentityNameUi();
  }
  clearPortraitPreview();
  showIdentityErrors([]);
}

function startCreationFlow() {
  const player = character.identity.playerName;
  const portrait = character.portrait;
  character = createCharacter();
  if (player) character.identity.playerName = player;
  if (portrait) character.portrait = portrait;
  const name = $('#identity-character-name')?.value?.trim();
  if (name) character.identity.characterName = name.slice(0, 50);
  completedSteps = new Set();
  currentStepIndex = 0;
  builderMode = 'create';
  setUiPhase('create');
  persist();
  refreshCharacterPicker();
  refreshGatePicker();
  updateDeleteButtons();
  renderNav();
  renderStepPanel();
}

function enterRetrainingFlow({ incrementLevel = false } = {}) {
  if (incrementLevel) {
    if (!canLevelUp(character)) {
      const msg = levelUpTooltip(character);
      if (msg) showErrors([msg]);
      return;
    }
    character.identity.level += 1;
  }
  character.builderFlags = character.builderFlags ?? {};
  character.builderFlags.retraining = true;
  ensureFeatSelectionsShape(character);
  pruneFeatSelections(character);
  ensurePowerSelectionsShape(character);
  prunePowerSelections(character);
  ensureRitualSelectionsShape(character);
  pruneRitualSelections(character);
  touchCharacter(character);
  const { completedSteps: completed, startStepIndex } = retrainingBuilderStart(flow());
  completedSteps = new Set(completed);
  builderMode = 'full';
  currentStepIndex = startStepIndex;
  const abilitiesIndex = flow().indexOf('abilities');
  if (abilitiesIndex >= 0 && pendingAbilityIncreaseLevels(character).length > 0) {
    completedSteps.delete('abilities');
    currentStepIndex = abilitiesIndex;
  }
  setUiPhase('full');
  persist();
  renderNav();
  renderStepPanel();
  const asiPending = pendingAbilityIncreaseLevels(character).length > 0;
  let msg;
  if (incrementLevel) {
    msg = asiPending
      ? `Level increased to ${character.identity.level}. Choose your ability score increase, then continue with powers, feats, and later steps.`
      : `Level increased to ${character.identity.level}. Continue with powers, feats, and later steps.`;
  } else {
    msg = 'Editing character at current level. Continue with powers, feats, and later steps.';
  }
  showErrors([msg]);
}

function startLevelUpFlow() {
  enterRetrainingFlow({ incrementLevel: true });
}

function startEditCharacterFlow() {
  enterRetrainingFlow({ incrementLevel: false });
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
      await renderRaceStep(panel, {
        character,
        compendium,
        def,
        applySelection: applyCompendiumSelection,
        onPersist: async () => persist(),
        refreshBonuses: refreshBonusesFromSelections,
        renderTutorHint: (p) => renderSelectionTutorHint(p, 'race'),
        linkIndex,
        renderPreviewEntry: (entry) => {
          const preview = panel.querySelector('#entry-preview');
          if (!entry || !preview) return;
          if (linkIndex?.terms?.length) renderLinkedEntryPreview(preview, entry.body_html ?? '', linkIndex);
          else preview.innerHTML = entry.body_html ?? '';
        }
      });
      break;
    case 'class':
      await renderClassStep(panel, {
        character,
        compendium,
        def,
        applySelection: applyCompendiumSelection,
        getNotes: () => getNotesForStep('class'),
        setNotes: (text) => setNotesForStep('class', text),
        onPersist: async () => persist(),
        refreshBonuses: refreshBonusesFromSelections,
        renderTutorHint: (p) => renderSelectionTutorHint(p, 'class'),
        linkIndex,
        renderPreviewEntry: (entry) => {
          const preview = panel.querySelector('#entry-preview');
          if (!entry || !preview) return;
          if (linkIndex?.terms?.length) renderLinkedEntryPreview(preview, entry.body_html ?? '', linkIndex);
          else preview.innerHTML = entry.body_html ?? '';
        }
      });
      break;
    case 'paragon':
    case 'epic':
      await renderCompendiumStep(panel, stepId, def);
      break;
    case 'abilities':
      await refreshBonusesFromSelections();
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
        onCollectionRefresh: refreshCharacterCollection,
        onActiveSlotChange: (slotId) => {
          activeFeatSlotId = slotId;
        },
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
        refreshBonuses: refreshBonusesFromSelections,
        onCollectionRefresh: refreshCharacterCollection,
        onActiveSlotChange: (slotId) => {
          activePowerSlotId = slotId;
        },
        renderTutorHint: (p) => renderSelectionTutorHint(p, 'powers')
      });
      break;
    case 'equipment':
      ensureEquipmentSelectionsShape(character);
      migrateEquipmentIdsToItems(character);
      await renderEquipmentStep(panel, {
        character,
        compendium,
        def,
        builderMode,
        onPersist: async () => persist(),
        renderTutorHint: (p) => renderSelectionTutorHint(p, 'equipment')
      });
      break;
    case 'review':
      renderReview(panel);
      break;
    default:
      panel.textContent = 'Step not implemented.';
  }

  showErrors([]);
  renderSheetMirror(character);
  await refreshCharacterCollection();
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
    ['background', character.selections.backgroundId]
  ];
  for (const [source, id] of map) {
    if (!id) continue;
    const entryId = source === 'race' ? raceBonusEntryId(id) ?? id : id;
    entries[source] = await compendium.getEntry(entryId);
  }
  const featEntries = [];
  const featIds = character.selections.featIds ?? [];
  for (const id of featIds) {
    const entry = await compendium.getEntry(id);
    if (entry) featEntries.push(entry);
  }
  ensureAbilityShape(character);
  syncBonusesFromSelections(character, entries, featEntries);
  syncRaceBonusChoicesToBonuses(character);
  if (entries.class) syncGrantedRitualIds(character, entries.class);
  cachedClassEntry = entries.class ?? null;
  try {
    await syncEquipmentToSheet(character, compendium, { classEntry: cachedClassEntry });
  } catch {
    /* equipment sync is best-effort; never block bonus refresh */
  }
  await syncCollectionNotes(character, compendium);
  renderSheetMirror(character);
  await refreshCharacterCollection();
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
  const hpHint = getHpSubstituteTutorHint(character);
  const abilityRec = getRecommendedAbilityPriorities(cachedClassEntry);
  const abilityRecAvailable = abilityRec.priority.length > 0;
  const level = character.identity.level;
  const storedIncreases = character.abilities.levelIncreases ?? {};
  const asiPairLevels = ASI_PAIR_LEVELS.filter((l) => level >= l);
  const asiAllLevels = ASI_ALL_LEVELS.filter((l) => level >= l);
  const showAsi = asiPairLevels.length > 0 || asiAllLevels.length > 0;

  panel.innerHTML = `
    <div class="point-buy-status ${over ? 'over' : ''}">
      Point-buy (base): <strong>${spent}</strong> / 22 spent
      ${remaining >= 0 ? `(${remaining} remaining)` : `(${-remaining} over budget)`}
    </div>
    <div class="power-step-recommend-row">
      <button
        type="button"
        id="ability-apply-recommended"
        class="btn-secondary"
        ${abilityRecAvailable ? '' : 'disabled'}
        title="${abilityRecAvailable ? `Auto-distribute the 22 points toward ${esc(abilityRec.keyAbilitiesText)}` : 'Select a class with key abilities on the Class step first.'}"
      >
        Recommended ability scores for this class
      </button>
      <p class="power-recommend-hint" id="ability-recommend-hint">
        ${abilityRecAvailable
          ? `Distributes your point-buy budget toward ${esc(abilityRec.keyAbilitiesText)} (key abilities for ${esc(abilityRec.classLabel ?? 'your class')}).`
          : 'No ability recommendation yet — pick a class with listed key abilities on the Class step.'}
      </p>
    </div>
    <p class="tutor-summary">${esc(formatBonusSummary(character))}</p>
    ${hpHint ? `<p class="tutor-hp-hint">${esc(hpHint)}</p>` : ''}
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
    ${showAsi ? `
    <section class="ability-asi" aria-label="Ability score increases">
      <h3 class="tutor-bonuses-title">Ability score increases (level up)</h3>
      <p class="tutor-footnote">At levels 4, 8, 14, 18, 24, and 28 raise two different abilities by +1. At levels 11 and 21 all six abilities gain +1 automatically. These increases stack and can exceed 18.</p>
      ${asiPairLevels.map((l) => {
        const choice = storedIncreases[l] ?? storedIncreases[String(l)] ?? [];
        const a0 = choice[0] ?? '';
        const a1 = choice[1] ?? '';
        const sameWarning = a0 && a1 && a0 === a1;
        return `
        <fieldset class="ability-asi-row" data-asi-level="${l}">
          <legend>Level ${l}: +1 to two different abilities</legend>
          <div class="ability-asi-selects">
            <label class="ability-asi-select">
              <span>First ability</span>
              <select id="asi-${l}-a" aria-label="Level ${l} first ability increase">
                <option value="">Choose…</option>
                ${ABILITY_KEYS.map((k) => `<option value="${k}" ${a0 === k ? 'selected' : ''}>${k.toUpperCase()}</option>`).join('')}
              </select>
            </label>
            <label class="ability-asi-select">
              <span>Second ability</span>
              <select id="asi-${l}-b" aria-label="Level ${l} second ability increase">
                <option value="">Choose…</option>
                ${ABILITY_KEYS.map((k) => `<option value="${k}" ${a1 === k ? 'selected' : ''}>${k.toUpperCase()}</option>`).join('')}
              </select>
            </label>
          </div>
          ${sameWarning ? `<p class="ability-asi-warning" role="alert">Pick two different abilities.</p>` : ''}
        </fieldset>`;
      }).join('')}
      ${asiAllLevels.map((l) => `<p class="ability-asi-auto">Level ${l}: +1 to all abilities (applied automatically).</p>`).join('')}
    </section>` : ''}
    <section class="sheet-mirror-section sheet-mirror-section--skills-table abilities-skills-section" aria-label="Skills">
      <h3 class="tutor-bonuses-title">Skills</h3>
      <p class="tutor-footnote">Use the <strong>Trained</strong> checkboxes to pick class skills (only class-skill rows are clickable). When a build is chosen on the Class step, suggested skills are pre-selected; you can deselect and switch to any other class skill. Fixed class skills stay locked. Totals include ability, half level, training, armor penalty, and bonuses from race, background, and feats.</p>
      <div id="abilities-skills-table"></div>
    </section>
    <section class="tutor-bonuses" id="tutor-bonuses"></section>
    <section class="tutor-bonuses" id="tutor-skill-bonuses"></section>
    <ul class="tutor-warnings" id="tutor-warnings" ${warnings.length ? '' : 'hidden'}></ul>`;

  renderTutorGuide(panel, 'abilityBonuses');

  const itemNote = document.createElement('p');
  itemNote.className = 'tutor-footnote';
  itemNote.textContent = TUTOR_GUIDE.itemBonuses.body;
  panel.appendChild(itemNote);

  renderBonusTable(panel.querySelector('#tutor-bonuses'), {
    title: 'Ability bonuses',
    empty:
      'Select class for ability bonuses. Racial bonuses are chosen on the race step. Same type on one ability does not stack; different types do.',
    rows: bonusesForTutorTable(bonuses),
    kind: 'ability'
  });

  renderBonusTable(panel.querySelector('#tutor-skill-bonuses'), {
    title: 'Skill bonuses',
    empty:
      'Select background and feats with skill bonuses. Racial skill bonuses are chosen on the race step. Two Skill-type bonuses on one skill do not add; Skill + Feat do.',
    rows: bonusesForTutorTable(skillBonuses),
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

  for (const l of asiPairLevels) {
    const selA = panel.querySelector(`#asi-${l}-a`);
    const selB = panel.querySelector(`#asi-${l}-b`);
    const onAsiChange = (e) => {
      const focusId = e?.target?.id;
      setLevelIncrease(character, l, [selA?.value ?? '', selB?.value ?? '']);
      persist();
      renderAbilities(panel);
      if (focusId) panel.querySelector(`#${focusId}`)?.focus();
    };
    selA?.addEventListener('change', onAsiChange);
    selB?.addEventListener('change', onAsiChange);
  }

  const abilityRecBtn = panel.querySelector('#ability-apply-recommended');
  abilityRecBtn?.addEventListener('click', () => {
    if (!abilityRecAvailable) return;
    const scores = autoPointBuy(abilityRec.priority);
    for (const a of ABILITY_KEYS) setBaseScore(character, a, scores[a]);
    persist();
    renderAbilities(panel);
  });

  const skillsHost = panel.querySelector('#abilities-skills-table');
  if (skillsHost) {
    skillsHost.innerHTML = renderSkillsTableHtml({ idPrefix: 'abilities' });
    delete skillsHost.dataset.skillsBound;
    attachSkillsTableHandlers(skillsHost, (fieldId, value) => {
      const trainedMatch = fieldId.match(/^skill-(.+)-trained$/);
      if (trainedMatch && cachedClassEntry) {
        const skillId = trainedMatch[1];
        const ctrl = getClassTrainedSkillCheckboxState(character, cachedClassEntry, skillId);
        if (!ctrl.editable) {
          populateAbilitiesSkillsTable(skillsHost);
          return;
        }
        const picked = character.selections?.classTrainedSkillChoices ?? [];
        const wants = Boolean(value);
        const has = picked.includes(skillId);
        if (wants === has) return;
        toggleClassTrainedSkill(character, skillId, cachedClassEntry);
        syncClassNotesAndGrants(character, cachedClassEntry);
        recomputeSkillBonuses(character);
        persist();
        populateAbilitiesSkillsTable(skillsHost);
        renderSheetMirror(character);
        return;
      }
      applySheetValueToCharacter(character, fieldId, value);
      recomputeSkillBonuses(character);
      persist();
      populateAbilitiesSkillsTable(skillsHost);
    });
    populateAbilitiesSkillsTable(skillsHost);
  }
}

function populateAbilitiesSkillsTable(host) {
  if (!host) return;
  const payload = buildMirrorPayload(character);
  populateSkillsTable(host, payload, getSkillFieldMap(), {
    getTrainedCheckboxState: (skillId) =>
      getClassTrainedSkillCheckboxState(character, cachedClassEntry, skillId)
  });
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
    hint.textContent = meta.featBonuses ?? meta.skillBonuses ?? meta.abilityBonuses;
  } else if (['race', 'class'].includes(stepId)) {
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
        const sel = e.id === selectedId;
        return `<button type="button" class="picker-btn w-full min-h-11 rounded-lg border border-slate-600 bg-slate-800 px-4 py-3 text-left text-base font-medium text-slate-100 hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500${sel ? ' ring-2 ring-amber-500/80' : ''}" data-id="${e.id}">
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
        persist();
      });
    });

    if (selectedId) {
      const entry = await compendium.getEntry(selectedId);
      preview.innerHTML = entry?.body_html ?? '';
    }
  }

  search.addEventListener('input', () => refresh(search.value));

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
    paragon: 'paragonPathId',
    epic: 'epicDestinyId'
  };
  return character.selections[map[stepId]];
}

function getNotesForStep(stepId) {
  if (stepId === 'class') return character.notes.classFeatures;
  if (stepId === 'background') return character.notes.backgroundFeatures ?? '';
  return '';
}

function setNotesForStep(stepId, text) {
  if (stepId === 'class') character.notes.classFeatures = text;
  if (stepId === 'background') character.notes.backgroundFeatures = text;
}

function applyCompendiumSelection(stepId, entry) {
  if (!entry) return;
  const name = entry.listing_fields?.Name ?? entry.id;
  switch (stepId) {
    case 'race': {
      character.selections.raceId = entry.id;
      character.identity.race = name;
      character.identity.size = entry.listing_fields?.Size ?? character.identity.size;
      if (document.querySelector('.compendium-picker[data-category="background"]')) {
        const search = document.querySelector('#picker-search');
        search?.dispatchEvent(new Event('input', { bubbles: true }));
      }
      break;
    }
    case 'class':
      character.selections.classId = entry.id;
      character.identity.class = name;
      character.identity.role = entry.listing_fields?.RoleName ?? '';
      break;
    case 'background': {
      if (character.selections.backgroundId !== entry.id) {
        resetBackgroundBonusChoices(character);
      }
      character.selections.backgroundId = entry.id;
      character.identity.background = name;
      character.selections.backgroundSkillBonusKind = parseBackgroundEntry(entry).skillBonusKind;
      character.notes.backgroundFeatures = buildBackgroundNotesText(
        entry,
        character.selections.backgroundBonusChoices,
        character.selections.backgroundEffectChoices
      );
      break;
    }
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
  renderSheetMirror(character);
}

function handleSheetMirrorChange(fieldId, value) {
  applySheetValueToCharacter(character, fieldId, value);
  persist();
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
  updateGateContinueState();
  updateDeleteButtons();
}

function updateGateContinueState() {
  const picker = $('#gate-char-picker');
  const btn = $('#btn-gate-continue');
  if (!picker || !btn) return;
  btn.disabled = !picker.value;
}

function updateDeleteButtons() {
  const picker = $('#char-picker');
  const gatePicker = $('#gate-char-picker');
  const id = picker?.value || gatePicker?.value || '';
  const hasId = Boolean(id);
  $('#btn-char-delete')?.toggleAttribute('disabled', !hasId);
  $('#btn-gate-delete')?.toggleAttribute('disabled', !hasId);
}

function showIdentityErrors(errors) {
  const box = $('#identity-errors');
  if (!box) return;
  if (!errors.length) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  box.hidden = false;
  box.innerHTML = errors.map((e) => `<li>${esc(e)}</li>`).join('');
}

function updateIdentityNameUi() {
  const input = $('#identity-character-name');
  const count = $('#identity-name-count');
  const btn = $('#btn-identity-continue');
  const len = input?.value?.length ?? 0;
  if (count) count.textContent = String(len);
  if (btn) btn.disabled = len < 1;
}

function clearPortraitPreview() {
  const preview = $('#identity-portrait-preview');
  const img = $('#identity-portrait-img');
  const clearBtn = $('#btn-identity-portrait-clear');
  if (preview) preview.classList.add('hidden');
  if (img) img.removeAttribute('src');
  if (clearBtn) clearBtn.classList.add('hidden');
  delete character.portrait;
}

async function loadPortraitFile(file) {
  if (!file) return;
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  character.portrait = { mimeType: file.type, dataUrl: String(dataUrl) };
  const img = $('#identity-portrait-img');
  const preview = $('#identity-portrait-preview');
  const clearBtn = $('#btn-identity-portrait-clear');
  if (img) img.src = character.portrait.dataUrl;
  if (preview) preview.classList.remove('hidden');
  if (clearBtn) clearBtn.classList.remove('hidden');
}

function deleteSelectedCharacter(id) {
  if (!id) return;
  const list = listCharacters();
  const entry = list.find((c) => c.id === id);
  const label = entry?.identity?.characterName || 'this character';
  if (!confirm(`Delete “${label}”? This cannot be undone.`)) return;
  deleteCharacter(id);
  const wasActive = character.id === id;
  refreshCharacterPicker();
  refreshGatePicker();
  if (wasActive) {
    character = createCharacter();
    builderMode = 'gate';
    setUiPhase('gate');
  }
  showErrors([`Deleted ${label}.`]);
}

function applyPlayerEditorUi() {
  if (!isPlayerMode()) return;
  document.body.classList.add('player-editor');
  const hint = $('#player-handoff-hint');
  if (hint) {
    hint.textContent =
      'Create a new level-1 character. When finished, click Save — your GM sees it in the party list.';
    hint.classList.remove('hidden');
  }
}

function setupReturnToGame() {
  const params = new URLSearchParams(location.search);
  const fromGame = params.get('from') === 'game';
  const returnHref = fromGame ? '../game/index.html' : sessionStorage.getItem(EDITOR_RETURN_KEY);
  const btn = $('#btn-return-game');
  if (returnHref && btn) {
    btn.classList.remove('hidden');
    btn.addEventListener('click', () => {
      window.location.href = returnHref;
    });
  }
}

async function saveCharacterNow() {
  persist();
  const messages = ['Character saved locally.'];
  if (isPlayerSession()) {
    try {
      await saveCharacterToCampaign(character);
      messages.push('Sent to your GM’s campaign.');
    } catch (err) {
      messages.push(`Campaign save failed: ${err.message}`);
    }
  }
  showErrors(messages);
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
    if (stepId === 'race' || stepId === 'class') {
      focusPendingChoice($('#step-panel'));
    }
    return;
  }
  completedSteps.add(stepId);
  if (stepId === 'review' && character.builderFlags?.retraining) {
    character.builderFlags.retraining = false;
  }
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
  const sheetHref = withPlayerMode('../sheet/index.html?from=editor');
  // Prefer a new tab so the editor stays open. If the browser blocks the popup,
  // fall back to same-tab navigation; the sheet toolbar has a link back here.
  const sheetWindow = window.open(sheetHref, '_blank');
  if (!sheetWindow) {
    window.location.href = sheetHref;
  }
}

function showInitError(message) {
  const box = $('#generator-init-error');
  if (!box) return;
  box.textContent = message;
  box.classList.remove('hidden');
}

/**
 * Attach all interactive control handlers. Called before any network load so a
 * missing metadata/ or data/ file on a deployment can never leave navigation
 * buttons (e.g. "Create new character") silently unresponsive.
 */
function wireControls() {
  $('#char-picker')?.addEventListener('change', (e) => {
    updateDeleteButtons();
    switchToCharacter(e.target.value);
  });
  $('#gate-char-picker')?.addEventListener('change', () => {
    updateGateContinueState();
    updateDeleteButtons();
  });
  $('#btn-gate-continue')?.addEventListener('click', () => {
    const id = $('#gate-char-picker')?.value;
    if (id) switchToCharacter(id);
  });
  $('#btn-gate-create')?.addEventListener('click', enterIdentitySetup);
  $('#btn-gate-delete')?.addEventListener('click', () => deleteSelectedCharacter($('#gate-char-picker')?.value));
  $('#btn-char-delete')?.addEventListener('click', () => deleteSelectedCharacter($('#char-picker')?.value || character.id));
  $('#btn-gate-export')?.addEventListener('click', exportCharacterFile);

  $('#identity-character-name')?.addEventListener('input', updateIdentityNameUi);
  $('#btn-identity-continue')?.addEventListener('click', () => {
    const name = $('#identity-character-name')?.value?.trim();
    if (!name) {
      showIdentityErrors(['Character name is required.']);
      return;
    }
    showIdentityErrors([]);
    startCreationFlow();
  });
  $('#btn-identity-back')?.addEventListener('click', () => {
    builderMode = 'gate';
    setUiPhase('gate');
  });
  $('#identity-portrait-file')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        await loadPortraitFile(file);
      } catch (err) {
        showIdentityErrors([err.message ?? String(err)]);
      }
    }
    e.target.value = '';
  });
  $('#btn-identity-portrait-clear')?.addEventListener('click', clearPortraitPreview);

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

  $('#btn-edit-character')?.addEventListener('click', startEditCharacterFlow);
  $('#btn-level-up')?.addEventListener('click', startLevelUpFlow);
  $('#btn-new-build')?.addEventListener('click', enterIdentitySetup);
  $('#btn-back-to-load')?.addEventListener('click', returnToGate);

  $('#btn-next')?.addEventListener('click', nextStep);
  $('#btn-prev')?.addEventListener('click', prevStep);
  $('#btn-save')?.addEventListener('click', () => saveCharacterNow());

  updateDeleteButtons();
}

async function init() {
  initBuildStamp();
  syncPlayerModeFromUrl();
  if (new URLSearchParams(location.search).get('mode') === 'player') {
    enablePlayerMode();
  }
  applyPlayerNav({ homeLink: $('#nav-home') });
  applyPlayerEditorUi();
  setupReturnToGame();

  // Wire controls and show the gate first, before any network load. This keeps
  // the page usable (and the "Create new character" button responsive) even if
  // the compendium or metadata files are slow or fail to load.
  wireControls();
  setUiPhase('gate');

  try {
    await loadEditorMeta();
    await compendium.ready();
    await hydrateSubracesFromProvider(compendium);
    linkIndex = await buildCompendiumLinkIndex(compendium);
  } catch (err) {
    console.error('[editor] Initialization failed', err);
    showInitError(
      `${err?.message ?? 'The character generator could not start.'} ` +
        'Reload the page to try again.'
    );
    return;
  }
  attachCompendiumHoverDelegates(document);

  const mirrorPanel = $('#sheet-mirror-panel');
  if (mirrorPanel) {
    initSheetMirror(mirrorPanel, handleSheetMirrorChange, openSheet);
  }

  const collectionPanel = $('#character-collection-panel');
  if (collectionPanel) {
    initCharacterCollectionPanel(collectionPanel);
    const ritualPicker = collectionPanel.querySelector('#character-collection-ritual-picker');
    if (ritualPicker) {
      ritualPicker.innerHTML = renderComboboxHtml({
        inputId: 'picker-ritual',
        listboxId: 'picker-listbox-ritual',
        placeholder: 'Select a ritual',
        visibleLabel: 'Ritual'
      });
      const ritualInput = ritualPicker.querySelector('#picker-ritual');
      const ritualListbox = ritualPicker.querySelector('#picker-listbox-ritual');
      if (ritualInput && ritualListbox) {
        ritualCombobox = attachComboboxBehavior(ritualInput, ritualListbox, (q) => {
          const slotId = ritualPicker.dataset.slotId;
          if (slotId) refreshRitualPicker(slotId, q);
        });
      }
    }
  }

  const params = new URLSearchParams(location.search);
  const loadId = params.get('id') || params.get('characterId');
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

  const session = getSessionCampaign();
  if (session?.role === 'player' && !character.identity.playerName) {
    character.identity.playerName = 'Player';
  }

  const status = compendium.getStatus();
  $('#compendium-status').textContent =
    status.mode === 'stub'
      ? 'Compendium: sample data (import DB for full rules)'
      : `Compendium: ${status.mode}`;
  $('#compendium-status').classList.toggle('mode-stub', status.mode === 'stub');

  ensureAbilityShape(character);
  ensureRaceSelectionsShape(character);
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
}

init().catch((err) => {
  console.error('[editor] Unexpected startup error', err);
  showInitError('The character generator failed to start. Reload the page to try again.');
});
