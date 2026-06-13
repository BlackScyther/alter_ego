import { escapeHtml } from '../shared/escape-html.js';

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildAlternation(terms) {
  if (!terms.length) return null;
  const parts = terms.map((t) => escapeRegex(t.name)).sort((a, b) => b.length - a.length);
  return parts.join('|');
}

/**
 * @param {string} plainText
 * @param {{ terms: Array<{ id: string, name: string, category_slug: string }> }} index
 */
export function linkCompendiumTermsInText(plainText, index) {
  const terms = index?.terms ?? [];
  const alt = buildAlternation(terms);
  if (!alt) return escapeHtml(plainText);

  const nameToId = new Map(terms.map((t) => [t.name.toLowerCase(), t.id]));
  const re = new RegExp(`(?<![\\w'’-])(${alt})(?![\\w'’-])`, 'gi');
  let out = '';
  let last = 0;
  let m;
  while ((m = re.exec(plainText)) !== null) {
    out += escapeHtml(plainText.slice(last, m.index));
    const matched = m[1];
    const id = nameToId.get(matched.toLowerCase());
    if (id) {
      out += `<span class="comp-link" data-entry-id="${escapeHtml(id)}" tabindex="0" role="button">${escapeHtml(matched)}</span>`;
    } else {
      out += escapeHtml(matched);
    }
    last = m.index + matched.length;
  }
  out += escapeHtml(plainText.slice(last));
  return out;
}

/**
 * @param {string} html
 * @param {{ terms: Array<{ id: string, name: string, category_slug: string }> }} index
 */
export function linkCompendiumTermsInHtml(html, index) {
  if (typeof document === 'undefined') return html;
  const container = document.createElement('div');
  container.innerHTML = html ?? '';
  walkTextNodes(container, (node) => {
    const linked = linkCompendiumTermsInText(node.textContent ?? '', index);
    if (linked === escapeHtml(node.textContent ?? '')) return;
    const span = document.createElement('span');
    span.innerHTML = linked;
    node.replaceWith(...span.childNodes);
  });
  return container.innerHTML;
}

function walkTextNodes(root, fn) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) fn(node);
}

/**
 * @param {HTMLElement} previewEl
 * @param {string} html
 * @param {{ terms: Array<{ id: string, name: string, category_slug: string }> }} index
 */
export function renderLinkedEntryPreview(previewEl, html, index) {
  if (!previewEl) return;
  previewEl.innerHTML = linkCompendiumTermsInHtml(html, index);
  previewEl.classList.add('comp-linked-preview');
}

