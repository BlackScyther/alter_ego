import { loadPartyFromFolder } from '../character/party-loader.js';
import { importCharacterDocument } from '../character/store.js';
import { stashCharacterForSheet } from '../character/sheet-bridge.js';
import { escapeHtml } from '../shared/escape-html.js';

const $ = (sel) => document.querySelector(sel);

function playlistSortKey(character) {
  const init = Number(character.sheet?.initMisc ?? 0);
  const name = (character.identity?.characterName ?? '').toLowerCase();
  return { init, name };
}

function sortParty(entries) {
  return [...entries].sort((a, b) => {
    const ka = playlistSortKey(a.character);
    const kb = playlistSortKey(b.character);
    if (kb.init !== ka.init) return kb.init - ka.init;
    return ka.name.localeCompare(kb.name);
  });
}

function openSheet(character) {
  importCharacterDocument(character, { forceNewId: false });
  stashCharacterForSheet(character);
  window.location.href = '../sheet/index.html?from=playlist';
}

function renderPlaylist(entries) {
  const list = $('#playlist-list');
  const empty = $('#playlist-empty');
  const status = $('#playlist-status');

  if (!entries.length) {
    status.textContent = 'Party folder is empty.';
    list.hidden = true;
    empty.hidden = false;
    return;
  }

  const sorted = sortParty(entries);
  status.textContent = `${sorted.length} character(s) — top of playlist highlighted.`;
  empty.hidden = true;
  list.hidden = false;
  list.innerHTML = '';

  sorted.forEach(({ file, character }, index) => {
    const id = character.identity;
    const isTop = index === 0;
    const li = document.createElement('li');
    li.className = isTop
      ? 'rounded-xl border-2 border-amber-500/80 bg-slate-800/80 p-4'
      : 'rounded-lg border border-slate-600 bg-slate-800/50 p-4';
    if (isTop) li.setAttribute('aria-label', 'Playlist top');

    li.innerHTML = `
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="${isTop ? 'text-xl' : 'text-lg'} font-semibold m-0">${escapeHtml(id.characterName || 'Unnamed')}</h2>
          <p class="mt-1 text-sm text-slate-400">
            Level ${id.level} · ${escapeHtml(id.race || '—')}${id.class ? ` / ${escapeHtml(id.class)}` : ''}
          </p>
          <p class="mt-1 text-xs text-slate-500">${escapeHtml(file)}</p>
        </div>
        <button type="button" data-open-sheet class="min-h-11 shrink-0 rounded-lg ${isTop ? 'bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold' : 'border border-slate-600 hover:bg-slate-700 font-medium'} px-4 py-2 text-base text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">
          Open sheet
        </button>
      </div>`;

    li.querySelector('[data-open-sheet]').addEventListener('click', () => openSheet(character));
    list.appendChild(li);
  });
}

async function load() {
  $('#playlist-status').textContent = 'Loading party folder…';
  try {
    const { loaded, failed } = await loadPartyFromFolder('../party/');
    if (failed.length) {
      console.warn('[playlist] failed files', failed);
    }
    renderPlaylist(loaded);
  } catch (err) {
    $('#playlist-status').textContent = `Could not load party: ${err.message}`;
    $('#playlist-empty').hidden = false;
  }
}

load();
