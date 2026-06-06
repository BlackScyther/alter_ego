import { initBuildStamp } from '../shared/build-stamp.js';
import { loadPartyFromFolder, loadCharactersFromFiles } from '../character/party-loader.js';
import { importCharacterDocument, saveCharacter } from '../character/store.js';
import { stashCharacterForSheet } from '../character/sheet-bridge.js';
import { characterExportFilename } from '../character/io.js';
import { buildQuickCharacter } from '../character/quick-build.js';
import { compendium } from '../data/compendium.js';
import {
  createCampaign,
  getSessionCampaign,
  isGmSession,
  clearSessionCampaign,
  listCampaignCharacters
} from '../api/campaign-api.js';

initBuildStamp();

const $ = (sel) => document.querySelector(sel);

let partyEntries = [];

function showErrors(messages) {
  const box = $('#gm-errors');
  if (!messages.length) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  box.hidden = false;
  box.innerHTML = messages.map((m) => `<li>${escapeHtml(m)}</li>`).join('');
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderParty() {
  const grid = $('#party-grid');
  if (!partyEntries.length) {
    grid.innerHTML = `
      <p class="gm-empty">
        No characters loaded. Players click <strong>Save</strong> in the editor after joining your campaign,
        or import JSON backups below.
      </p>`;
    return;
  }

  grid.innerHTML = '';
  for (const { file, character } of partyEntries) {
    const id = character.identity;
    const card = document.createElement('article');
    card.className = 'gm-card';
    card.innerHTML = `
      <h3>${escapeHtml(id.characterName || 'Unnamed')}</h3>
      <p class="gm-card-meta">Level ${id.level} · ${escapeHtml(id.race || '—')} ${id.class ? `/ ${escapeHtml(id.class)}` : ''}</p>
      <p class="gm-card-meta">Player: ${escapeHtml(id.playerName || '—')}</p>
      <p class="gm-card-file">${escapeHtml(file)}</p>
      <div class="gm-card-actions">
        <button type="button" class="btn-primary" data-action="sheet">Open sheet</button>
        <button type="button" class="btn-secondary" data-action="editor">Open in editor</button>
      </div>
    `;

    card.querySelector('[data-action="sheet"]').addEventListener('click', () => openSheet(character));
    card.querySelector('[data-action="editor"]').addEventListener('click', () => openEditor(character));
    grid.appendChild(card);
  }
}

function openSheet(character) {
  importCharacterDocument(character, { forceNewId: false });
  stashCharacterForSheet(character);
  window.location.href = '../sheet/index.html?from=gm';
}

function openEditor(character) {
  const saved = importCharacterDocument(character, { forceNewId: false });
  window.location.href = `../editor/index.html?id=${encodeURIComponent(saved.id)}`;
}

function mergeFileEntries(entries) {
  const byId = new Map(partyEntries.map((e) => [e.character.id, e]));
  for (const entry of entries) {
    byId.set(entry.character.id, entry);
  }
  partyEntries = [...byId.values()].sort((a, b) =>
    (a.character.identity.characterName || '').localeCompare(
      b.character.identity.characterName || '',
      undefined,
      { sensitivity: 'base' }
    )
  );
}

async function reloadFromFolder() {
  try {
    const { loaded, failed } = await loadPartyFromFolder('../party/');
    mergeFileEntries(
      loaded.map(({ file, character }) => ({
        file: file || characterExportFilename(character),
        character
      }))
    );
    showErrors(failed.map((f) => `${f.file}: ${f.error}`));
    $('#party-status').textContent = `${partyEntries.length} character(s) loaded`;
  } catch (err) {
    showErrors([err.message ?? String(err)]);
  }
  renderParty();
}

async function reloadOnlineParty() {
  if (!isGmSession()) return;
  try {
    const data = await listCampaignCharacters();
    partyEntries = (data.characters ?? []).map((entry) => ({
      file: entry.file || characterExportFilename(entry.character),
      character: entry.character
    }));
    $('#party-status').textContent = `${partyEntries.length} character(s) in “${data.name || 'campaign'}”`;
    showErrors([]);
  } catch (err) {
    $('#party-status').textContent = 'Could not load campaign party';
    showErrors([err.message ?? String(err)]);
    partyEntries = [];
  }
  renderParty();
}

async function onFilesPicked(fileList) {
  if (!fileList?.length) return;
  const { loaded, failed } = await loadCharactersFromFiles([...fileList]);
  mergeFileEntries(
    loaded.map(({ file, character }) => ({
      file: file || characterExportFilename(character),
      character
    }))
  );
  showErrors(failed.map((f) => `${f.file}: ${f.error}`));
  $('#party-status').textContent = `${partyEntries.length} character(s) loaded`;
  renderParty();
}

function refreshCampaignUi() {
  const session = getSessionCampaign();
  const setup = $('#campaign-setup');
  const active = $('#campaign-active');
  if (session?.role === 'gm') {
    setup.hidden = true;
    active.hidden = false;
    $('#campaign-title').textContent = session.name;
    $('#invite-url').value = session.inviteUrl || '';
  } else {
    setup.hidden = false;
    active.hidden = true;
  }
}

$('#btn-create-campaign').addEventListener('click', async () => {
  const name = $('#campaign-name').value.trim() || 'Our campaign';
  try {
    await createCampaign(name);
    refreshCampaignUi();
    await reloadOnlineParty();
    showErrors(['Campaign created. Copy the invite link for players.']);
  } catch (err) {
    showErrors([err.message ?? String(err)]);
  }
});

$('#btn-copy-invite').addEventListener('click', async () => {
  const url = $('#invite-url').value;
  if (!url) return;
  try {
    await navigator.clipboard.writeText(url);
    showErrors(['Invite link copied.']);
  } catch {
    showErrors(['Could not copy — select the link and copy manually.']);
  }
});

$('#btn-leave-campaign').addEventListener('click', () => {
  clearSessionCampaign();
  refreshCampaignUi();
  partyEntries = [];
  $('#party-status').textContent = 'Create or join a campaign to see player characters.';
  renderParty();
});

$('#btn-quick-build').addEventListener('click', async () => {
  try {
    await compendium.ready();
    const session = getSessionCampaign();
    const character = await buildQuickCharacter({
      race: $('#qb-race').value,
      class: $('#qb-class').value,
      level: $('#qb-level').value,
      characterName: $('#qb-name').value,
      campaignId: session?.campaignId ?? null
    });
    saveCharacter(character);
    mergeFileEntries([
      { file: characterExportFilename(character), character }
    ]);
    $('#party-status').textContent = `${partyEntries.length} character(s) loaded`;
    renderParty();
    showErrors([`Quick-built ${character.identity.characterName}. Open in editor to refine.`]);
  } catch (err) {
    showErrors([err.message ?? String(err)]);
  }
});

$('#btn-reload-dev').addEventListener('click', reloadFromFolder);
$('#file-picker').addEventListener('change', (e) => {
  onFilesPicked(e.target.files);
  e.target.value = '';
});

refreshCampaignUi();
if (isGmSession()) {
  reloadOnlineParty();
  setInterval(reloadOnlineParty, 8000);
} else {
  reloadFromFolder();
}
