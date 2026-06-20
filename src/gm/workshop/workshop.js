import { initBuildStamp } from '../../shared/build-stamp.js';
import { escapeHtml } from '../../shared/escape-html.js';
import { isGmSession } from '../../api/campaign-api.js';
import {
  listHomebrewEntries,
  getGmSlug,
  setGmSlug,
  homebrewSourceBook,
  getHomebrewEntry as fetchHomebrewEntry
} from '../../api/homebrew-api.js';
import { listWorkshopCategories, WORKSHOP_CATEGORIES } from './category-columns.js';
import { initEntryEditorDialog } from './entry-editor-dialog.js';
import { compendiumEntryPageUrl } from '../../ui/compendium-entry-url.js';
import { getSourceBookDates, saveSourceBook } from '../../api/source-books-api.js';

initBuildStamp();

const $ = (sel) => document.querySelector(sel);

function showErrors(messages) {
  const box = $('#ws-errors');
  if (!box) return;
  if (!messages.length) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  box.hidden = false;
  box.innerHTML = messages.map((m) => `<li>${escapeHtml(m)}</li>`).join('');
}

/** @type {string | null} */
let activeCategory = null;

const editor = initEntryEditorDialog({
  dialog: /** @type {HTMLDialogElement} */ ($('#dialog-entry-editor')),
  duplicateDialog: /** @type {HTMLDialogElement} */ ($('#dialog-duplicate')),
  onSaved: () => {
    if (activeCategory) renderEntryList(activeCategory);
  },
  onDeleted: () => {
    if (activeCategory) renderEntryList(activeCategory);
  },
  showErrors
});

function renderGmSlugPanel() {
  const input = $('#ws-gm-slug');
  const hint = $('#ws-source-hint');
  if (!input) return;
  const slug = getGmSlug();
  input.value = slug;
  if (hint) {
    hint.textContent = slug
      ? `Entries use source ${homebrewSourceBook(slug)}`
      : 'Set your GM slug before saving entries.';
  }
}

function renderCategoryDashboard() {
  const grid = $('#ws-category-grid');
  if (!grid) return;
  grid.innerHTML = listWorkshopCategories()
    .map(
      (cat) =>
        `<button type="button" class="ws-category-btn" data-category="${escapeHtml(cat.slug)}">
          ${escapeHtml(cat.displayName)}
        </button>`
    )
    .join('');

  grid.querySelectorAll('.ws-category-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cat = btn.getAttribute('data-category');
      if (cat) selectCategory(cat);
    });
  });
}

function selectCategory(categorySlug) {
  activeCategory = categorySlug;
  const meta = WORKSHOP_CATEGORIES[categorySlug];
  const title = $('#ws-category-title');
  const workspace = $('#ws-category-workspace');
  const dashboard = $('#ws-dashboard');
  if (title) title.textContent = meta?.displayName ?? categorySlug;
  if (workspace) workspace.hidden = false;
  if (dashboard) dashboard.hidden = true;
  renderEntryList(categorySlug);
}

function showDashboard() {
  activeCategory = null;
  const workspace = $('#ws-category-workspace');
  const dashboard = $('#ws-dashboard');
  if (workspace) workspace.hidden = true;
  if (dashboard) dashboard.hidden = false;
}

async function renderEntryList(categorySlug, search = '') {
  const listEl = $('#ws-entry-list');
  const statusEl = $('#ws-list-status');
  if (!listEl) return;

  listEl.innerHTML = '<p class="text-sm text-slate-400">Loading…</p>';
  try {
    const entries = await listHomebrewEntries({
      category: categorySlug,
      search: search.length >= 3 ? search : undefined,
      limit: 200
    });
    if (statusEl) {
      if (search.length > 0 && search.length < 3) {
        statusEl.textContent = 'Type at least 3 characters to search.';
      } else {
        statusEl.textContent = `${entries.length} homebrew ${entries.length === 1 ? 'entry' : 'entries'}`;
      }
    }
    if (!entries.length) {
      listEl.innerHTML =
        '<p class="text-sm text-slate-400">No entries yet. Create one or duplicate from the compendium.</p>';
      return;
    }
    listEl.innerHTML = entries
      .map((e) => {
        const name = escapeHtml(e.listing_fields?.Name ?? e.id);
        const meta = escapeHtml(
          [e.listing_fields?.Level, e.listing_fields?.SourceBook].filter(Boolean).join(' · ')
        );
        return `<article class="ws-entry-row" data-entry-id="${escapeHtml(e.id)}">
          <div class="ws-entry-main">
            <h3 class="ws-entry-name">${name}</h3>
            <p class="ws-entry-meta">${meta}</p>
          </div>
          <div class="ws-entry-actions">
            <button type="button" class="btn-secondary text-sm min-h-9" data-action="edit">Edit</button>
            <button type="button" class="btn-secondary text-sm min-h-9" data-action="view">Open</button>
            <button type="button" class="btn-secondary text-sm min-h-9" data-action="duplicate">Duplicate</button>
          </div>
        </article>`;
      })
      .join('');

    listEl.querySelectorAll('.ws-entry-row').forEach((row) => {
      const id = row.getAttribute('data-entry-id');
      if (!id) return;
      row.querySelector('[data-action="edit"]')?.addEventListener('click', async () => {
        const entry = await fetchHomebrewEntry(id);
        if (entry) editor.open({ mode: 'edit', category: categorySlug, entry });
      });
      row.querySelector('[data-action="view"]')?.addEventListener('click', () => {
        const url = compendiumEntryPageUrl(id, location.pathname);
        window.open(url, '_blank', 'noopener');
      });
      row.querySelector('[data-action="duplicate"]')?.addEventListener('click', async () => {
        const entry = await fetchHomebrewEntry(id);
        if (entry) editor.open({ mode: 'create', category: categorySlug, template: entry });
      });
    });
  } catch (err) {
    listEl.innerHTML = '';
    showErrors([err.message ?? String(err)]);
  }
}

const SOURCE_ERAS = ['core', 'heroic', 'paragon', 'epic', 'setting', 'dragon', 'other'];

function setSourceDatesStatus(message) {
  const el = $('#ws-source-dates-status');
  if (el) el.textContent = message;
}

async function renderSourceDatesList() {
  const listEl = $('#ws-source-dates-list');
  if (!listEl) return;
  listEl.innerHTML = '<p class="text-sm text-slate-400">Loading…</p>';
  let books;
  try {
    books = await getSourceBookDates();
  } catch (err) {
    listEl.innerHTML = '';
    setSourceDatesStatus(err.message ?? String(err));
    return;
  }

  const rows = Object.entries(books).sort((a, b) => {
    const da = a[1]?.release_date ?? '';
    const db = b[1]?.release_date ?? '';
    if (!da && db) return -1;
    if (da && !db) return 1;
    if (da !== db) return da < db ? -1 : 1;
    return a[0].localeCompare(b[0]);
  });

  const missing = rows.filter(([, meta]) => !meta?.release_date).length;
  setSourceDatesStatus(
    `${rows.length} source books${missing ? ` · ${missing} missing a date` : ' · all dated'}`
  );

  listEl.innerHTML = rows
    .map(([code, meta]) => {
      const title = escapeHtml(meta?.title ?? code);
      const date = escapeHtml(meta?.release_date ?? '');
      const era = meta?.edition_era ?? '';
      const eraOptions = ['', ...SOURCE_ERAS]
        .map((e) => `<option value="${e}"${e === era ? ' selected' : ''}>${e || '—'}</option>`)
        .join('');
      return `<div class="ws-source-dates-row${meta?.release_date ? '' : ' ws-source-dates-row--missing'}" data-code="${escapeHtml(code)}">
        <div class="ws-source-dates-name">
          <span class="ws-source-dates-code">${escapeHtml(code)}</span>
          <span class="ws-source-dates-title">${title}</span>
        </div>
        <label class="ws-source-dates-field">
          <span class="sr-only">Release date for ${escapeHtml(code)}</span>
          <input type="date" data-source-date-input value="${date}" />
        </label>
        <label class="ws-source-dates-field">
          <span class="sr-only">Edition era for ${escapeHtml(code)}</span>
          <select data-source-era-input aria-label="Edition era for ${escapeHtml(code)}">${eraOptions}</select>
        </label>
      </div>`;
    })
    .join('');

  listEl.querySelectorAll('.ws-source-dates-row').forEach((row) => {
    const code = row.getAttribute('data-code');
    if (!code) return;
    const dateInput = row.querySelector('[data-source-date-input]');
    const eraInput = row.querySelector('[data-source-era-input]');

    const persist = async (patch) => {
      try {
        await saveSourceBook(code, patch);
        row.classList.toggle('ws-source-dates-row--missing', !dateInput?.value);
        setSourceDatesStatus(`Saved ${code}.`);
      } catch (err) {
        setSourceDatesStatus(err.message ?? String(err));
      }
    };

    dateInput?.addEventListener('change', () => persist({ release_date: dateInput.value || null }));
    eraInput?.addEventListener('change', () => persist({ edition_era: eraInput.value || null }));
  });
}

function openSourceDatesDialog() {
  const dialog = /** @type {HTMLDialogElement} */ ($('#dialog-source-dates'));
  if (!dialog) return;
  dialog.showModal();
  renderSourceDatesList();
}

function init() {
  if (!isGmSession()) {
    $('#ws-no-session').hidden = false;
    return;
  }

  $('#ws-workspace').hidden = false;
  renderGmSlugPanel();
  renderCategoryDashboard();

  $('#btn-save-gm-slug')?.addEventListener('click', () => {
    const slug = $('#ws-gm-slug')?.value?.trim() ?? '';
    if (!/^[a-zA-Z0-9_]+$/.test(slug)) {
      showErrors(['GM slug must contain only letters, numbers, and underscores.']);
      return;
    }
    setGmSlug(slug);
    renderGmSlugPanel();
    showErrors(['GM slug saved.']);
  });

  $('#btn-source-dates')?.addEventListener('click', openSourceDatesDialog);
  $('#dialog-source-dates')?.querySelectorAll('[data-close-dialog]').forEach((btn) => {
    btn.addEventListener('click', () => $('#dialog-source-dates')?.close());
  });

  $('#btn-back-dashboard')?.addEventListener('click', showDashboard);
  $('#btn-new-entry')?.addEventListener('click', () => {
    if (!activeCategory) return;
    editor.open({ mode: 'create', category: activeCategory });
  });
  $('#btn-dup-compendium')?.addEventListener('click', () => {
    if (!activeCategory) return;
    editor.openDuplicatePicker(activeCategory);
  });

  const searchInput = $('#ws-entry-search');
  searchInput?.addEventListener('input', () => {
    if (!activeCategory) return;
    renderEntryList(activeCategory, searchInput.value.trim());
  });
}

init();
