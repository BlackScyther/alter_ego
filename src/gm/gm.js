import { loadPartyFromFolder, loadCharactersFromFiles } from '../character/party-loader.js';
import { importCharacterDocument } from '../character/store.js';
import { stashCharacterForSheet } from '../character/sheet-bridge.js';
import { characterExportFilename } from '../character/io.js';

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
        No characters loaded. Export JSON from the editor, copy files into
        <code>src/party/</code>, run <code>npm run party:index</code>, then click Reload.
        Or use “Add JSON files…” to load exports without copying them into the folder.
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

async function reloadFromFolder() {
  $('#party-status').textContent = 'Loading party folder…';
  showErrors([]);

  try {
    const { loaded, failed } = await loadPartyFromFolder('../party/');
    partyEntries = loaded;
    const messages = failed.map((f) => `${f.file}: ${f.error}`);
    showErrors(messages);

    const count = loaded.length;
    $('#party-status').textContent =
      count > 0
        ? `${count} character(s) from src/party/`
        : 'Party folder is empty — add JSON files and run npm run party:index';
  } catch (err) {
    partyEntries = [];
    $('#party-status').textContent = 'Could not load party folder';
    showErrors([err.message ?? String(err)]);
  }

  renderParty();
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

$('#btn-reload').addEventListener('click', reloadFromFolder);
$('#file-picker').addEventListener('change', (e) => {
  onFilesPicked(e.target.files);
  e.target.value = '';
});

reloadFromFolder();
