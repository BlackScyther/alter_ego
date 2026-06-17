import { initBuildStamp } from '../../../shared/build-stamp.js';
import { compendium } from '../../../data/compendium.js';
import { getSessionCampaign, isGmSession, listCampaignCharacters } from '../../../api/campaign-api.js';
import {
  listEncounters,
  createEncounter,
  getEncounter,
  deleteEncounter,
  getActiveEncounterId,
  setActiveEncounterId,
  spawnActor,
  deleteActor,
  updateActor,
  patchActorInitiative,
  patchActorHp,
  patchEncounterPhase
} from '../../../api/encounter-api.js';
import { applyCharacterRewards } from '../../../api/rewards-api.js';
import { importCharacterDocument } from '../../../character/store.js';
import { stashCharacterForSheet } from '../../../character/sheet-bridge.js';
import {
  staticInitiative,
  totalInitiative,
  sortCombatants,
  applyInitiativeRoll,
  usesPrintedInitiativeBonus
} from '../../../encounter/combat-helpers.js';
import { readActorStats, applyActorStatsPatch } from '../../../encounter/actor-stats.js';
import {
  renderSourceComboHtml,
  attachSourceCombo,
  getActiveSourceBooksFromCombo
} from '../../../editor/picker/picker-source-combo.js';

const COMPENDIUM_PICKER_KEY = 'encounter-compendium';

initBuildStamp();

const $ = (sel) => document.querySelector(sel);

/** @type {import('../../../api/encounter-api.js').Encounter | null} */
let encounter = null;
let partyCharacters = [];
let compendiumCategory = 'monster';
/** @type {Array<{ id: string, category_slug: string, listing_fields?: Record<string, string> }>} */
let rewardSelectedItems = [];

function esc(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function showErrors(messages) {
  const box = $('#enc-errors');
  if (!messages.length) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  box.hidden = false;
  box.innerHTML = messages.map((m) => `<li>${esc(m)}</li>`).join('');
}

function encounterPhase() {
  return encounter?.phase === 'initiative' ? 'initiative' : 'rest';
}

function isLinked(actor) {
  return Boolean(actor.linkedCharacterId);
}

function linkedPcs() {
  return (encounter?.actors ?? []).filter((a) => a.linkedCharacterId);
}

async function refreshEncounter(encounterId) {
  encounter = await getEncounter(encounterId);
  render();
}

async function loadEncounters() {
  const list = await listEncounters();
  const select = $('#encounter-select');
  const session = getSessionCampaign();
  const activeId = getActiveEncounterId(session.campaignId);
  select.innerHTML = '';

  if (!list.length) {
    const enc = await createEncounter('Encounter 1');
    list.push(enc);
  }

  for (const row of list) {
    const opt = document.createElement('option');
    opt.value = row.id;
    opt.textContent = row.name;
    select.appendChild(opt);
  }

  const pick = activeId && list.some((e) => e.id === activeId) ? activeId : list[0].id;
  select.value = pick;
  setActiveEncounterId(session.campaignId, pick);
  await refreshEncounter(pick);
  $('#enc-status').textContent = `${list.length} encounter(s)`;
}

function renderPhaseChrome() {
  const phase = encounterPhase();
  const banner = $('#enc-phase-banner');
  const restPanel = $('#enc-rest-panel');
  const initPanel = $('#enc-initiative-panel');

  if (phase === 'rest') {
    banner.className = 'enc-phase-banner enc-phase-banner--rest';
    banner.textContent = 'Rest mode — add participants and review stats before combat.';
    restPanel.classList.remove('hidden');
    initPanel.classList.add('hidden');
    $('#btn-start-initiative').hidden = false;
    $('#btn-back-rest').hidden = true;
    $('#btn-reset-initiative').hidden = true;
    $('#btn-end-encounter').hidden = true;
  } else {
    banner.className = 'enc-phase-banner enc-phase-banner--initiative';
    banner.textContent = 'Initiative mode — enter d20 rolls. Highest total goes first; ties break on static initiative.';
    restPanel.classList.add('hidden');
    initPanel.classList.remove('hidden');
    $('#btn-start-initiative').hidden = true;
    $('#btn-back-rest').hidden = false;
    $('#btn-reset-initiative').hidden = false;
    $('#btn-end-encounter').hidden = false;
  }
}

function render() {
  renderPhaseChrome();
  if (encounterPhase() === 'rest') renderRestRoster();
  else renderInitiativeList();
}

function renderRestRoster() {
  const grid = $('#enc-roster');
  const actors = encounter?.actors ?? [];
  if (!actors.length) {
    grid.innerHTML = '<p class="text-slate-400">No participants yet. Add party members, monsters, or NPCs.</p>';
    return;
  }

  grid.innerHTML = '';
  for (const actor of actors) {
    const ch = actor.character;
    const stats = readActorStats(ch);
    const linked = isLinked(actor);
    const editable = !linked;
    const staticInit = staticInitiative(ch);
    const kind = linked ? 'Linked PC' : esc(actor.actorKind || 'npc');
    const card = document.createElement('article');
    card.className = `enc-card enc-card--compact${linked ? ' enc-readonly' : ''}`;

    const hpLine = linked
      ? `<span class="enc-stat-value">${stats.hpCurrent} / ${stats.hpMax}</span>`
      : `<span class="enc-inline-inputs">
          <input type="number" data-field="hpCurrent" value="${stats.hpCurrent}" aria-label="HP current" />
          <span class="enc-stat-sep">/</span>
          <input type="number" data-field="hpMax" value="${stats.hpMax}" aria-label="HP max" />
        </span>`;

    const defParts = [
      ['ac', 'AC', stats.defenses.ac],
      ['fort', 'Fort', stats.defenses.fort],
      ['ref', 'Ref', stats.defenses.ref],
      ['will', 'Will', stats.defenses.will]
    ];

    const defLine = linked
      ? `<span class="enc-stat-value">${defParts.map(([, label, val]) => `${label} ${val}`).join(' · ')}</span>`
      : `<span class="enc-inline-defenses">${defParts
          .map(
            ([field, label, val]) =>
              `<label class="enc-mini-stat"><span>${label}</span>
                <input type="number" data-field="${field}" value="${val}" aria-label="${label}" />
              </label>`
          )
          .join('')}</span>`;

    const savesLine = linked
      ? `<span class="enc-stat-value">${esc(stats.saveMods) || '—'}</span>`
      : `<input type="text" data-field="saveMods" value="${esc(stats.saveMods)}" class="enc-stat-input enc-stat-input--wide" aria-label="Saves and modifiers" />`;

    const initLine = linked
      ? `<span class="enc-stat-value">+${staticInit}</span>`
      : `<input type="number" data-field="staticInit" value="${staticInit}" class="enc-stat-input" aria-label="Static initiative"${
          editable && usesPrintedInitiativeBonus(ch) ? '' : ' readonly'
        } />`;

    card.innerHTML = `
      <header class="enc-card-head">
        <h3>${esc(ch.identity?.characterName || 'Unnamed')}</h3>
        <p class="enc-card-meta">Lv ${stats.level} · ${kind}</p>
      </header>
      <dl class="enc-stat-lines">
        <div class="enc-stat-line">
          <dt>HP</dt>
          <dd>${hpLine}</dd>
        </div>
        <div class="enc-stat-line">
          <dt>Def</dt>
          <dd>${defLine}</dd>
        </div>
        <div class="enc-stat-line">
          <dt>Saves</dt>
          <dd>${savesLine}</dd>
        </div>
        <div class="enc-stat-line">
          <dt>Init</dt>
          <dd>${initLine}</dd>
        </div>
      </dl>
      <div class="enc-card-actions">
        <button type="button" class="btn-secondary enc-btn-sm" data-action="sheet">Sheet</button>
        <button type="button" class="btn-secondary enc-btn-sm" data-action="dup">Dup</button>
        <button type="button" class="btn-secondary enc-btn-sm" data-action="remove">Remove</button>
        ${editable ? '<button type="button" class="btn-secondary enc-btn-sm" data-action="editor">Edit</button><button type="button" class="btn-primary enc-btn-sm" data-action="save">Save</button>' : ''}
      </div>
    `;

    card.querySelector('[data-action="editor"]')?.addEventListener('click', () => openEditor(actor));
    card.querySelector('[data-action="sheet"]')?.addEventListener('click', () => openSheet(ch));
    card.querySelector('[data-action="dup"]')?.addEventListener('click', () => duplicateActor(actor));
    card.querySelector('[data-action="remove"]')?.addEventListener('click', () => removeActor(actor));
    card.querySelector('[data-action="save"]')?.addEventListener('click', () => saveActorCard(actor, card));
    grid.appendChild(card);
  }
}

async function saveActorCard(actor, card) {
  if (isLinked(actor)) return;
  const ch = structuredClone(actor.character);
  applyActorStatsPatch(ch, {
    hpCurrent: card.querySelector('[data-field="hpCurrent"]')?.value,
    hpMax: card.querySelector('[data-field="hpMax"]')?.value,
    defenses: {
      ac: card.querySelector('[data-field="ac"]')?.value,
      fort: card.querySelector('[data-field="fort"]')?.value,
      ref: card.querySelector('[data-field="ref"]')?.value,
      will: card.querySelector('[data-field="will"]')?.value
    },
    initMisc: usesPrintedInitiativeBonus(ch)
      ? card.querySelector('[data-field="staticInit"]')?.value
      : undefined,
    saveMods: card.querySelector('[data-field="saveMods"]')?.value
  });

  try {
    await updateActor(encounter.id, actor.actorId, ch);
    await refreshEncounter(encounter.id);
    showErrors([]);
  } catch (err) {
    showErrors([err.message]);
  }
}

function renderInitiativeList() {
  const list = $('#enc-initiative-list');
  const sorted = sortCombatants(encounter?.actors ?? []);

  if (!sorted.length) {
    list.innerHTML = '<li class="text-slate-400">No combatants.</li>';
    return;
  }

  list.innerHTML = '';
  sorted.forEach((actor, index) => {
    const ch = actor.character;
    const staticVal = staticInitiative(ch);
    const roll = ch.sheet?.combat?.initiativeRoll;
    const total = totalInitiative(ch);
    const li = document.createElement('li');
    li.className = 'enc-initiative-row';
    li.innerHTML = `
      <span class="enc-initiative-rank" aria-hidden="true">#${index + 1}</span>
      <div>
        <div class="enc-initiative-name">${esc(ch.identity?.characterName || 'Unnamed')}</div>
        <div class="enc-initiative-static">Static: ${staticVal}</div>
        <label class="text-xs text-slate-400 mt-1 block">HP current
          <input type="number" data-hp class="mt-0.5 w-20 rounded border border-slate-600 bg-slate-800 px-2 py-1" value="${ch.sheet?.hp?.current ?? ''}" />
        </label>
      </div>
      <label class="text-sm text-slate-400">d20 roll
        <input type="number" data-roll min="1" max="20" class="mt-1 w-full rounded border border-slate-600 bg-slate-800 px-2 py-2" value="${roll ?? ''}" placeholder="—" />
      </label>
      <div class="text-sm text-slate-400">Total</div>
      <div class="enc-initiative-total" data-total>${total ?? '—'}</div>
    `;

    const rollInput = li.querySelector('[data-roll]');
    rollInput.addEventListener('change', async () => {
      const raw = rollInput.value;
      const value = raw === '' ? null : Number(raw);
      const updated = applyInitiativeRoll(structuredClone(ch), value);
      try {
        await patchActorInitiative(encounter.id, actor.actorId, {
          initiativeRoll: updated.sheet.combat.initiativeRoll,
          initiative: updated.sheet.combat.initiative
        });
        await refreshEncounter(encounter.id);
        showErrors([]);
      } catch (err) {
        showErrors([err.message]);
      }
    });

    const hpInput = li.querySelector('[data-hp]');
    hpInput.addEventListener('change', async () => {
      try {
        await patchActorHp(encounter.id, actor.actorId, { current: hpInput.value });
        showErrors([]);
      } catch (err) {
        showErrors([err.message]);
      }
    });

    list.appendChild(li);
  });
}

function openEditor(actor) {
  const saved = importCharacterDocument(actor.character, { forceNewId: false });
  sessionStorage.setItem('dnd4e.editorReturn', '../gm/campaigns/encounters/index.html');
  window.location.href = `../../../editor/index.html?id=${encodeURIComponent(saved.id)}&from=encounter`;
}

function openSheet(character) {
  stashCharacterForSheet(character);
  window.location.href = '../../../sheet/index.html?from=encounter';
}

async function duplicateActor(actor) {
  try {
    await spawnActor(encounter.id, { source: 'duplicate', actorId: actor.actorId });
    await refreshEncounter(encounter.id);
    showErrors([]);
  } catch (err) {
    showErrors([err.message]);
  }
}

async function removeActor(actor) {
  try {
    await deleteActor(encounter.id, actor.actorId);
    await refreshEncounter(encounter.id);
    showErrors([]);
  } catch (err) {
    showErrors([err.message]);
  }
}

async function openPartyDialog() {
  const list = $('#party-pick-list');
  list.innerHTML = '';
  if (!partyCharacters.length) {
    list.innerHTML = '<p class="text-slate-400">No player characters in this campaign yet.</p>';
  } else {
    for (const entry of partyCharacters) {
      const ch = entry.character;
      const row = document.createElement('div');
      row.className = 'enc-pick-row';
      row.innerHTML = `
        <span>${esc(ch.identity?.characterName || 'Unnamed')} (Lv ${ch.identity?.level ?? '?'})</span>
        <span>
          <button type="button" class="btn-secondary text-sm" data-mode="link">Link</button>
          <button type="button" class="btn-secondary text-sm" data-mode="copy">Copy</button>
        </span>
      `;
      row.querySelector('[data-mode="link"]').addEventListener('click', async () => {
        await spawnActor(encounter.id, { source: 'party', characterId: ch.id, mode: 'link' });
        $('#dialog-party').close();
        await refreshEncounter(encounter.id);
      });
      row.querySelector('[data-mode="copy"]').addEventListener('click', async () => {
        await spawnActor(encounter.id, { source: 'party', characterId: ch.id, mode: 'copy' });
        $('#dialog-party').close();
        await refreshEncounter(encounter.id);
      });
      list.appendChild(row);
    }
  }
  $('#dialog-party').showModal();
}

async function mountCompendiumSourceFilter() {
  const toolbar = $('#compendium-source-toolbar');
  if (!toolbar) return;
  const sourceBooks = await compendium.distinctSourceBooks(compendiumCategory);
  const label = compendiumCategory === 'monster' ? 'Monster source' : 'Source';
  toolbar.innerHTML = renderSourceComboHtml({
    pickerKey: COMPENDIUM_PICKER_KEY,
    sourceBooks,
    groupLabel: label
  });
  attachSourceCombo(toolbar, COMPENDIUM_PICKER_KEY, () => {
    renderCompendiumPicks($('#compendium-search')?.value ?? '');
  });
}

async function openCompendiumDialog(category, title) {
  compendiumCategory = category;
  $('#compendium-dialog-title').textContent = title;
  await compendium.ready();
  await mountCompendiumSourceFilter();
  await renderCompendiumPicks('');
  $('#dialog-compendium').showModal();
}

async function renderCompendiumPicks(query) {
  const sourceBooks = getActiveSourceBooksFromCombo(COMPENDIUM_PICKER_KEY);
  const entries = await compendium.listEntries(compendiumCategory, {
    search: query,
    limit: 50,
    sourceBooks: sourceBooks ?? undefined
  });
  const list = $('#compendium-pick-list');
  if (!entries.length) {
    list.innerHTML = '<p class="text-slate-400">No entries found.</p>';
    return;
  }
  list.innerHTML = '';
  for (const entry of entries) {
    const name = entry.listing_fields?.Name || entry.id;
    const level = entry.listing_fields?.Level || '—';
    const row = document.createElement('div');
    row.className = 'enc-pick-row';
    row.innerHTML = `<span>${esc(name)} <span class="text-slate-500">Lv ${esc(level)}</span></span>`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-primary text-sm';
    btn.textContent = 'Add';
    btn.addEventListener('click', async () => {
      try {
        await spawnActor(encounter.id, {
          source: 'compendium',
          category: compendiumCategory,
          entryId: entry.id
        });
        $('#dialog-compendium').close();
        await refreshEncounter(encounter.id);
        showErrors([]);
      } catch (err) {
        showErrors([err.message]);
      }
    });
    row.appendChild(btn);
    list.appendChild(row);
  }
}

function renderRewardTargets(containerId, prefix) {
  const container = $(containerId);
  const pcs = linkedPcs();
  if (!pcs.length) {
    container.innerHTML = '<p class="text-sm text-slate-500 m-0">No linked PCs in this encounter.</p>';
    return;
  }
  container.innerHTML = pcs
    .map((actor) => {
      const name = actor.character?.identity?.characterName || 'PC';
      const id = actor.linkedCharacterId;
      return `
        <label>
          <input type="checkbox" name="${prefix}-target" value="${esc(id)}" checked />
          ${esc(name)}
        </label>`;
    })
    .join('');
}

function getCheckedTargets(prefix) {
  return [...document.querySelectorAll(`input[name="${prefix}-target"]:checked`)].map((el) => el.value);
}

async function renderRewardItemPicks(query) {
  await compendium.ready();
  const categories = ['armor', 'weapon', 'item', 'implement'];
  /** @type {Array<object>} */
  let entries = [];
  for (const cat of categories) {
    const rows = await compendium.listEntries(cat, { search: query, limit: 15 });
    entries = entries.concat(rows);
  }
  const list = $('#reward-item-picks');
  if (!entries.length) {
    list.innerHTML = '<p class="text-slate-400 text-sm m-0">No items found.</p>';
    return;
  }
  list.innerHTML = '';
  for (const entry of entries.slice(0, 30)) {
    const name = entry.listing_fields?.Name || entry.id;
    const row = document.createElement('div');
    row.className = 'enc-pick-row';
    row.innerHTML = `<span class="text-sm">${esc(name)}</span>`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-secondary text-sm';
    btn.textContent = 'Add';
    btn.addEventListener('click', () => {
      if (!rewardSelectedItems.some((i) => i.id === entry.id)) {
        rewardSelectedItems.push(entry);
        updateRewardItemsSummary();
      }
    });
    row.appendChild(btn);
    list.appendChild(row);
  }
}

function updateRewardItemsSummary() {
  const el = $('#reward-selected-items');
  if (!rewardSelectedItems.length) {
    el.textContent = 'No items selected.';
    return;
  }
  el.textContent = `Selected: ${rewardSelectedItems.map((e) => e.listing_fields?.Name || e.id).join(', ')}`;
}

async function openRewardsDialog() {
  rewardSelectedItems = [];
  updateRewardItemsSummary();
  renderRewardTargets('#reward-xp-targets', 'xp');
  renderRewardTargets('#reward-gold-targets', 'gold');
  renderRewardTargets('#reward-item-targets', 'item');
  await renderRewardItemPicks('');
  $('#dialog-rewards').showModal();
}

async function applyRewards() {
  const xpTotal = Number($('#reward-xp').value) || 0;
  const goldTotal = Number($('#reward-gold').value) || 0;
  const xpTargets = getCheckedTargets('xp');
  const goldTargets = getCheckedTargets('gold');
  const itemTargets = getCheckedTargets('item');

  if (!xpTargets.length && !goldTargets.length && !itemTargets.length && !rewardSelectedItems.length) {
    showErrors(['Select at least one linked PC or reward.']);
    return;
  }

  const messages = [];
  try {
    if (xpTotal > 0 && xpTargets.length) {
      const each = Math.floor(xpTotal / xpTargets.length);
      for (const id of xpTargets) {
        await applyCharacterRewards(id, { xp: each });
      }
      messages.push(`XP ${each} each to ${xpTargets.length} character(s).`);
    }

    if (goldTotal > 0 && goldTargets.length) {
      const each = Math.floor(goldTotal / goldTargets.length);
      for (const id of goldTargets) {
        await applyCharacterRewards(id, { goldGp: each });
      }
      messages.push(`Gold ${each} gp each to ${goldTargets.length} character(s).`);
    }

    if (rewardSelectedItems.length && itemTargets.length) {
      for (const id of itemTargets) {
        await applyCharacterRewards(id, {
          items: rewardSelectedItems.map((entry) => ({
            compendiumId: entry.id,
            categorySlug: entry.category_slug
          }))
        });
      }
      messages.push(`Items to ${itemTargets.length} character(s).`);
    }

    $('#dialog-rewards').close();
    for (const actor of encounter?.actors ?? []) {
      await patchActorInitiative(encounter.id, actor.actorId, { initiative: null, initiativeRoll: null });
    }
    await patchEncounterPhase(encounter.id, 'rest');
    await refreshEncounter(encounter.id);
    showErrors(messages.length ? messages : ['Rewards applied.']);
  } catch (err) {
    showErrors([err.message]);
  }
}

async function startInitiative() {
  const hasRolls = (encounter?.actors ?? []).some((a) => a.character?.sheet?.combat?.initiativeRoll != null);
  if (hasRolls && !confirm('Clear existing initiative rolls and start fresh?')) return;

  for (const actor of encounter?.actors ?? []) {
    await patchActorInitiative(encounter.id, actor.actorId, { initiative: null, initiativeRoll: null });
  }
  await patchEncounterPhase(encounter.id, 'initiative');
  await refreshEncounter(encounter.id);
  showErrors([]);
}

async function backToRest() {
  await patchEncounterPhase(encounter.id, 'rest');
  await refreshEncounter(encounter.id);
  showErrors([]);
}

async function resetInitiative() {
  for (const actor of encounter?.actors ?? []) {
    await patchActorInitiative(encounter.id, actor.actorId, { initiative: null, initiativeRoll: null });
  }
  await refreshEncounter(encounter.id);
  showErrors([]);
}

async function init() {
  if (!isGmSession()) {
    $('#enc-no-campaign').hidden = false;
    return;
  }

  $('#enc-workspace').hidden = false;
  await compendium.ready();

  try {
    const data = await listCampaignCharacters();
    partyCharacters = data.characters ?? [];
  } catch {
    partyCharacters = [];
  }

  await loadEncounters();

  $('#encounter-select').addEventListener('change', async (e) => {
    const id = e.target.value;
    const session = getSessionCampaign();
    setActiveEncounterId(session.campaignId, id);
    await refreshEncounter(id);
  });

  $('#btn-new-encounter').addEventListener('click', async () => {
    const name = prompt('Encounter name', `Encounter ${(await listEncounters()).length + 1}`);
    if (!name) return;
    const enc = await createEncounter(name);
    await loadEncounters();
    $('#encounter-select').value = enc.id;
    await refreshEncounter(enc.id);
  });

  $('#btn-delete-encounter').addEventListener('click', async () => {
    if (!encounter?.id) return;
    if (!confirm('Delete this encounter and all its actors?')) return;
    await deleteEncounter(encounter.id);
    await loadEncounters();
  });

  $('#btn-add-party').addEventListener('click', openPartyDialog);
  $('#btn-add-monster').addEventListener('click', () => openCompendiumDialog('monster', 'Add monster'));
  $('#btn-add-npc').addEventListener('click', () => openCompendiumDialog('monster', 'Add NPC / creature'));
  $('#btn-add-blank').addEventListener('click', async () => {
    await spawnActor(encounter.id, { source: 'blank' });
    await refreshEncounter(encounter.id);
  });

  $('#btn-start-initiative').addEventListener('click', startInitiative);
  $('#btn-back-rest').addEventListener('click', backToRest);
  $('#btn-reset-initiative').addEventListener('click', resetInitiative);
  $('#btn-end-encounter').addEventListener('click', openRewardsDialog);
  $('#btn-apply-rewards').addEventListener('click', applyRewards);

  document.querySelectorAll('[data-close-dialog]').forEach((btn) => {
    btn.addEventListener('click', () => btn.closest('dialog')?.close());
  });

  $('#compendium-search')?.addEventListener('input', (e) => {
    renderCompendiumPicks(e.target.value);
  });

  $('#reward-item-search')?.addEventListener('input', (e) => {
    renderRewardItemPicks(e.target.value);
  });
}

init().catch((err) => showErrors([err.message]));
