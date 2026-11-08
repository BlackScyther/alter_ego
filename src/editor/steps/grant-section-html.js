/**
 * Read-only grant rows for the power and feat steps.
 * These slots are not buttons: the player changes them on Race, Class,
 * Background, Theme, or Equipment.
 */

import { escapeHtml as esc } from '../../shared/escape-html.js';
import { pickerCardClass } from '../picker/picker-card.js';

/**
 * @param {{ href: string, ariaLabel: string, text?: string }} link
 */
function renderGrantLink(link) {
  const visible = link.text
    ? `<span aria-hidden="true">↗</span> ${esc(link.text)}`
    : '<span aria-hidden="true">↗</span>';
  return `<a
    class="character-collection-open power-slot-open power-grant-open"
    href="${esc(link.href)}"
    target="_blank"
    rel="noopener noreferrer"
    title="${esc(link.ariaLabel)}"
    aria-label="${esc(link.ariaLabel)}"
  >${visible}</a>`;
}

/**
 * Usage sits in the box with the name. The compendium link stays on the name line.
 * @param {{ name: string, meta?: string, usage?: string | null, links?: Array<{ href: string, ariaLabel: string, text?: string }> }} row
 */
function renderGrantRow(row) {
  const links = (row.links ?? []).map(renderGrantLink).join('');
  const meta = [row.usage, row.meta].filter(Boolean).join(' · ');
  const metaHtml = meta
    ? `<span class="power-grant-meta block text-sm font-normal text-slate-400">${esc(meta)}</span>`
    : '';
  return `<div class="${pickerCardClass(false)} power-grant-slot" role="group" aria-readonly="true">
    <div class="power-grant-name-line">
      <span class="power-grant-name">${esc(row.name)}</span>
      ${links}
    </div>
    ${metaHtml}
  </div>`;
}

/**
 * @param {{ kind: string, title: string, ariaLabel: string, note: string, groups: Array<{ heading?: string, rows: object[] }> }} section
 * @returns {string}
 */
export function renderGrantSectionHtml(section) {
  const groups = (section.groups ?? []).filter((group) => group.rows?.length);
  if (!groups.length) return '';
  const body = groups
    .map((group) => {
      const heading = group.heading
        ? `<h4 class="power-type-heading">${esc(group.heading)}</h4>`
        : '';
      const rows = group.rows.map(renderGrantRow).join('');
      return `<div class="power-type-section">${heading}<div class="flex flex-col gap-2 w-full">${rows}</div></div>`;
    })
    .join('');
  return `<section class="power-grant-section" data-grant-kind="${esc(section.kind)}" aria-label="${esc(section.ariaLabel)}">
    <h4 class="power-step-panel-label">${esc(section.title)}</h4>
    <p class="feat-step-hint">${esc(section.note)}</p>
    ${body}
  </section>`;
}
