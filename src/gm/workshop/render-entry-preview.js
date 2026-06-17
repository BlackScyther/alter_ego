import { escapeHtml } from '../../shared/escape-html.js';

/**
 * Render compendium-parity preview HTML for a draft or saved entry.
 * @param {{
 *   category_slug: string,
 *   listing_fields?: Record<string, string>,
 *   body_html?: string
 * }} entry
 */
export function renderEntryPreviewHtml(entry) {
  const fields = entry.listing_fields ?? {};
  const name = fields.Name ?? 'Untitled entry';
  const metaParts = [
    entry.category_slug,
    fields.Type,
    fields.Tier,
    fields.Level,
    fields.SourceBook
  ].filter(Boolean);

  const columns = Object.entries(fields).filter(
    ([key, val]) => val && key !== 'ID'
  );

  const fieldsTable =
    columns.length > 0
      ? `<table class="ws-preview-fields"><tbody>${columns
          .map(
            ([key, val]) =>
              `<tr><th scope="row">${escapeHtml(key)}</th><td>${escapeHtml(String(val))}</td></tr>`
          )
          .join('')}</tbody></table>`
      : '';

  const body = entry.body_html?.trim()
    ? entry.body_html
    : '<p class="ws-preview-empty">No description yet.</p>';

  return `<header class="ws-preview-header">
    <h3 class="ws-preview-title">${escapeHtml(name)}</h3>
    <p class="ws-preview-meta">${escapeHtml(metaParts.join(' · '))}</p>
  </header>
  ${fieldsTable}
  <div class="entry-preview ws-preview-body">${body}</div>`;
}
