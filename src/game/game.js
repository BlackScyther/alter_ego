import { initBuildStamp } from '../shared/build-stamp.js';
import { compendium } from '../data/compendium.js';
import { getSessionCampaign, isGmSession, listCampaignCharacters } from '../api/campaign-api.js';
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
  patchActorInitiative
} from '../api/encounter-api.js';
import { importCharacterDocument } from '../character/store.js';
import { stashCharacterForSheet } from '../character/sheet-bridge.js';
import { initiative as calcInitiative } from '../formulas.js';

initBuildStamp();

const $ = (sel) => document.querySelector(sel);

let encounter = null;
let partyCharacters = [];
let compendiumCategory = 'monster';

function esc(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function showErrors(messages) {
  const box = $('#game-errors');
  if (!messages.length) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  box.hidden = false;
  box.innerHTML = messages.map((m) => `<li>${esc(m)}</li>`).join('');
}

function combatBlock(character) {
  character.sheet = character.sheet ?? {};
  character.sheet.combat = character.sheet.combat ?? {};
  return character.sheet.combat;
}

function initiativeValue(character) {
  const combat = combatBlock(character);
  return combat.initiative == null ? null : Number(combat.initiative);
}

async function refreshEncounter(encounterId) {
  encounter = await getEncounter(encounterId);
  renderRoster();
  renderCombat();
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
  $('#game-status').textContent = `${list.length} encounter(s)`;
}

function renderRoster() {
  const grid = $('#roster-grid');
  const actors = encounter?.actors ?? [];
  if (!actors.length) {
    grid.innerHTML = '<p class="text-slate-400">No actors yet. Add party members or monsters.</p>';
    return;
  }

  grid.innerHTML = '';
  for (const actor of actors) {
    const ch = actor.character;
    const id = ch?.identity;
    const card = document.createElement('article');
    card.className = 'game-card';
    const linked = Boolean(actor.linkedCharacterId);
    card.innerHTML = `
      <h3>${esc(id?.characterName || 'Unnamed')}</h3>
      <p class="game-card-meta">Lv ${id?.level ?? '?'} · ${esc(id?.race || '—')} ${id?.class ? `/ ${esc(id.class)}` : ''}</p>
      <p class="game-card-meta">${linked ? 'Linked PC' : esc(actor.actorKind || 'npc')}</p>
      <div class="game-card-actions">
        <button type="button" class="btn-primary" data-action="editor">Edit</button>
        <button type="button" class="btn-secondary" data-action="sheet">Sheet</button>
        <button type="button" class="btn-secondary" data-action="dup">Duplicate</button>
        <button type="button" class="btn-secondary" data-action="remove">Remove</button>
      </div>
    `;
    card.querySelector('[data-action="editor"]').addEventListener('click', () => openEditor(actor));
    card.querySelector('[data-action="sheet"]').addEventListener('click', () => openSheet(ch));
    card.querySelector('[data-action="dup"]').addEventListener('click', () => duplicateActor(actor));
    card.querySelector('[data-action="remove"]').addEventListener('click', () => removeActor(actor));
    grid.appendChild(card);
  }
}

function renderCombat() {
  const list = $('#combat-list');
  const actors = [...(encounter?.actors ?? [])];
  actors.sort((a, b) => (initiativeValue(b.character) ?? -Infinity) - (initiativeValue(a.character) ?? -Infinity));

  if (!actors.length) {
    list.innerHTML = '<p class="text-slate-400 p-4">No combatants yet.</p>';
    return;
  }

  list.innerHTML = '';
  for (const actor of actors) {
    const ch = actor.character;
    const combat = combatBlock(ch);
    const init = combat.initiative;
    const dex = ch.abilities?.scores?.dex ?? 10;
    const lvl = ch.identity?.level ?? 1;
    const suggested = calcInitiative(dex, lvl, ch.sheet?.initMisc ?? 0);
    const row = document.createElement('article');
    row.className = 'game-card';
    row.innerHTML = `
      <h3>${esc(ch.identity?.characterName || 'Unnamed')}</h3>
      <p class="game-card-meta">Suggested (Dex): ${suggested}</p>
      <label class="text-sm text-slate-400">Initiative
        <input type="number" data-field="initiative" class="mt-1 w-full rounded border border-slate-600 bg-slate-800 px-3 py-2" value="${init ?? ''}" placeholder="—" />
      </label>
    `;
    row.querySelector('[data-field="initiative"]').addEventListener('change', async (e) => {
      const raw = e.target.value;
      const value = raw === '' ? null : Number(raw);
      try {
        await patchActorInitiative(encounter.id, actor.actorId, { initiative: value, initiativeRoll: null });
        await refreshEncounter(encounter.id);
        showErrors([]);
      } catch (err) {
        showErrors([err.message]);
      }
    });
    list.appendChild(row);
  }
}

function openEditor(actor) {
  const saved = importCharacterDocument(actor.character, { forceNewId: false });
  sessionStorage.setItem('dnd4e.editorReturn', '../game/index.html');
  window.location.href = `../editor/index.html?id=${encodeURIComponent(saved.id)}&from=game`;
}

function openSheet(character) {
  stashCharacterForSheet(character);
  window.location.href = '../sheet/index.html?from=game';
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
      row.className = 'game-pick-row';
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

async function openCompendiumDialog(category, title) {
  compendiumCategory = category;
  $('#compendium-dialog-title').textContent = title;
  await compendium.ready();
  await renderCompendiumPicks('');
  $('#dialog-compendium').showModal();
}

async function renderCompendiumPicks(query) {
  const entries = await compendium.listEntries(compendiumCategory, { search: query, limit: 50 });
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
    row.className = 'game-pick-row';
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

async function init() {
  if (!isGmSession()) {
    $('#game-no-campaign').hidden = false;
    return;
  }

  $('#game-workspace').hidden = false;
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
  $('#btn-add-companion').addEventListener('click', () => openCompendiumDialog('monster', 'Add creature'));
  $('#btn-add-blank').addEventListener('click', async () => {
    await spawnActor(encounter.id, { source: 'blank' });
    await refreshEncounter(encounter.id);
  });

  $('#btn-reset-initiative').addEventListener('click', async () => {
    for (const actor of encounter?.actors ?? []) {
      await patchActorInitiative(encounter.id, actor.actorId, { initiative: null, initiativeRoll: null });
    }
    await refreshEncounter(encounter.id);
    showErrors([]);
  });

  document.querySelectorAll('.game-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.game-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const name = tab.dataset.tab;
      $('#tab-roster').classList.toggle('hidden', name !== 'roster');
      $('#tab-combat').classList.toggle('hidden', name !== 'combat');
    });
  });

  document.querySelectorAll('[data-close-dialog]').forEach((btn) => {
    btn.addEventListener('click', () => btn.closest('dialog')?.close());
  });

  $('#compendium-search')?.addEventListener('input', (e) => {
    renderCompendiumPicks(e.target.value);
  });
}

init().catch((err) => showErrors([err.message]));
