import { escapeHtml } from '../../shared/escape-html.js';
import { compendium } from '../../data/compendium.js';
import {
  createHomebrewEntry,
  updateHomebrewEntry,
  deleteHomebrewEntry,
  getGmSlug,
  homebrewSourceBook
} from '../../api/homebrew-api.js';
import { getEditableColumns } from './category-columns.js';
import { renderEntryPreviewHtml } from './render-entry-preview.js';
import { renderSourceComboHtml, attachSourceCombo, getActiveSourceBooksFromCombo } from '../../editor/picker/picker-source-combo.js';

const SLUG_RE = /^[a-zA-Z0-9_]+$/;

/**
 * @param {{
 *   dialog: HTMLDialogElement,
 *   duplicateDialog: HTMLDialogElement,
 *   onSaved?: () => void,
 *   onDeleted?: () => void,
 *   showErrors: (messages: string[]) => void
 * }} opts
 */
export function initEntryEditorDialog({
  dialog,
  duplicateDialog,
  onSaved,
  onDeleted,
  showErrors
}) {
  const formEl = dialog.querySelector('#ws-editor-form');
  const fieldsEl = dialog.querySelector('#ws-editor-fields');
  const bodyEl = dialog.querySelector('#ws-editor-body');
  const previewEl = dialog.querySelector('#ws-editor-preview');
  const titleEl = dialog.querySelector('#ws-editor-title');
  const sourceBookEl = dialog.querySelector('#ws-editor-source-book');
  const dupListEl = duplicateDialog.querySelector('#ws-dup-list');
  const dupSearchEl = duplicateDialog.querySelector('#ws-dup-search');
  const dupToolbarEl = duplicateDialog.querySelector('#ws-dup-source-toolbar');

  /** @type {{ mode: 'create' | 'edit', category: string, entryId: string | null, listing_fields: Record<string, string>, body_html: string } | null} */
  let draft = null;
  let dupCategory = '';

  function readDraftFromForm() {
    if (!draft || !fieldsEl) return;
    const listing = { ...draft.listing_fields };
    for (const input of fieldsEl.querySelectorAll('[data-field]')) {
      const key = input.getAttribute('data-field');
      if (!key) continue;
      listing[key] = input.value.trim();
    }
    draft.listing_fields = listing;
    draft.body_html = bodyEl?.value ?? '';
  }

  function renderPreview() {
    if (!draft || !previewEl) return;
    readDraftFromForm();
    const gmSlug = getGmSlug();
    const sourceBook = gmSlug ? homebrewSourceBook(gmSlug) : '';
    previewEl.innerHTML = renderEntryPreviewHtml({
      category_slug: draft.category,
      listing_fields: { ...draft.listing_fields, SourceBook: sourceBook },
      body_html: draft.body_html
    });
  }

  function renderFieldInputs() {
    if (!draft || !fieldsEl) return;
    const columns = getEditableColumns(draft.category);
    fieldsEl.innerHTML = columns
      .map((col) => {
        const id = `ws-field-${col}`;
        const val = escapeHtml(draft.listing_fields[col] ?? '');
        const required = col === 'Name' ? ' required' : '';
        return `<label class="ws-field" for="${id}">
          <span class="ws-field-label">${escapeHtml(col)}</span>
          <input type="text" id="${id}" data-field="${escapeHtml(col)}" value="${val}" class="ws-field-input"${required} />
        </label>`;
      })
      .join('');

    fieldsEl.querySelectorAll('.ws-field-input').forEach((input) => {
      input.addEventListener('input', renderPreview);
    });
  }

  function ensureGmSlug() {
    const slug = getGmSlug().trim();
    if (slug && SLUG_RE.test(slug)) return slug;
    const entered = window.prompt(
      'Enter your GM author slug (letters, numbers, underscores only). Entries will use source hbrw_yourslug.',
      slug || 'gm'
    );
    if (!entered) return null;
    const trimmed = entered.trim();
    if (!SLUG_RE.test(trimmed)) {
      showErrors(['GM slug must contain only letters, numbers, and underscores.']);
      return null;
    }
    localStorage.setItem('dnd4e.workshop.gmSlug', trimmed);
    return trimmed;
  }

  /**
   * @param {{ mode: 'create' | 'edit', category: string, entry?: object, template?: object }} opts
   */
  function open(opts) {
    const gmSlug = ensureGmSlug();
    if (!gmSlug) return;

    const category = opts.category;
    const template = opts.template ?? opts.entry;
    const listing = { ...(template?.listing_fields ?? {}) };
    delete listing.ID;
    delete listing.SourceBook;

    draft = {
      mode: opts.mode,
      category,
      entryId: opts.mode === 'edit' && opts.entry ? opts.entry.id : null,
      listing_fields: listing,
      body_html: template?.body_html ?? ''
    };

    if (titleEl) {
      titleEl.textContent =
        opts.mode === 'edit'
          ? `Edit ${listing.Name || 'entry'}`
          : `New ${category} entry`;
    }
    if (sourceBookEl) {
      sourceBookEl.textContent = homebrewSourceBook(gmSlug);
    }
    const deleteBtn = dialog.querySelector('[data-ws-delete]');
    if (deleteBtn) deleteBtn.hidden = opts.mode !== 'edit';
    if (bodyEl) {
      bodyEl.value = draft.body_html;
      bodyEl.oninput = renderPreview;
    }

    renderFieldInputs();
    renderPreview();
    dialog.showModal();
  }

  async function save() {
    if (!draft) return;
    readDraftFromForm();
    const gmSlug = ensureGmSlug();
    if (!gmSlug) return;

    const name = String(draft.listing_fields.Name ?? '').trim();
    if (!name) {
      showErrors(['Name is required.']);
      return;
    }

    try {
      if (draft.mode === 'edit' && draft.entryId) {
        await updateHomebrewEntry(draft.entryId, {
          listing_fields: draft.listing_fields,
          body_html: draft.body_html,
          gm_slug: gmSlug
        });
      } else {
        await createHomebrewEntry({
          category_slug: draft.category,
          listing_fields: draft.listing_fields,
          body_html: draft.body_html,
          gm_slug: gmSlug
        });
      }
      dialog.close();
      draft = null;
      onSaved?.();
      showErrors(['Entry saved.']);
    } catch (err) {
      showErrors([err.message ?? String(err)]);
    }
  }

  async function remove() {
    if (!draft?.entryId) return;
    if (!window.confirm('Delete this homebrew entry? This cannot be undone.')) return;
    try {
      await deleteHomebrewEntry(draft.entryId);
      dialog.close();
      draft = null;
      onDeleted?.();
      showErrors(['Entry deleted.']);
    } catch (err) {
      showErrors([err.message ?? String(err)]);
    }
  }

  async function renderDuplicateList() {
    if (!dupListEl || !dupCategory) return;
    const q = dupSearchEl?.value?.trim() ?? '';
    const sourceBooks = getActiveSourceBooksFromCombo('ws-dup');
    const entries = await compendium.listEntries(dupCategory, {
      search: q.length >= 3 ? q : undefined,
      limit: 80,
      sourceBooks: sourceBooks ?? undefined,
      includeHomebrew: false
    });
    if (!entries.length) {
      dupListEl.innerHTML = '<p class="text-sm text-slate-400">No compendium entries found.</p>';
      return;
    }
    dupListEl.innerHTML = entries
      .map((e) => {
        const name = escapeHtml(e.listing_fields?.Name ?? e.id);
        const meta = escapeHtml(
          [e.listing_fields?.Level, e.listing_fields?.SourceBook].filter(Boolean).join(' · ')
        );
        return `<button type="button" class="ws-dup-row" data-entry-id="${escapeHtml(e.id)}">
          <span class="ws-dup-name">${name}</span>
          <span class="ws-dup-meta">${meta}</span>
        </button>`;
      })
      .join('');

    dupListEl.querySelectorAll('.ws-dup-row').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-entry-id');
        if (!id) return;
        const entry = await compendium.getEntry(id);
        if (!entry) return;
        duplicateDialog.close();
        open({ mode: 'create', category: dupCategory, template: entry });
      });
    });
  }

  function openDuplicatePicker(category) {
    dupCategory = category;
    if (dupSearchEl) dupSearchEl.value = '';
    duplicateDialog.showModal();
    compendium.ready().then(async () => {
      const books = await compendium.distinctSourceBooks(category, { includeHomebrew: false });
      if (dupToolbarEl) {
        dupToolbarEl.innerHTML = renderSourceComboHtml({
          pickerKey: 'ws-dup',
          sourceBooks: books,
          groupLabel: 'Source'
        });
        attachSourceCombo(duplicateDialog, 'ws-dup', renderDuplicateList);
      }
      renderDuplicateList();
    });
  }

  dialog.querySelector('[data-ws-save]')?.addEventListener('click', () => {
    save().catch((err) => showErrors([err.message]));
  });
  dialog.querySelector('[data-ws-delete]')?.addEventListener('click', () => {
    remove().catch((err) => showErrors([err.message]));
  });
  dialog.querySelectorAll('[data-close-dialog]').forEach((btn) => {
    btn.addEventListener('click', () => dialog.close());
  });
  duplicateDialog.querySelectorAll('[data-close-dialog]').forEach((btn) => {
    btn.addEventListener('click', () => duplicateDialog.close());
  });
  dupSearchEl?.addEventListener('input', () => {
    renderDuplicateList().catch((err) => showErrors([err.message]));
  });

  return { open, openDuplicatePicker };
}
