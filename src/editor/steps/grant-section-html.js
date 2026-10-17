/**
 * Read-only grant rows for the power and feat steps.
 * These slots are not buttons: the player changes them on Race, Class, or Equipment.
 */

import { POWER_TYPE_ORDER } from '../../character/power-selections.js';
import { escapeHtml as esc } from '../../shared/escape-html.js';
import { pickerCardClass } from '../picker/picker-card.js';

/**
 * @param {Array<{ usage?: string | null }>} rows
 * @returns {Array<{ heading: string, rows: object[] }>}
 */
export function groupsForUsage(rows) {
  const buckets = new Map(POWER_TYPE_ORDER.map((type) => [type, []]));
  /** @type {object[]} */
  const other = [];
  for (const row of rows) {
    if (row.usage && buckets.has(row.usage)) buckets.get(row.usage).push(row);
    else other.push(row);
  }
  /** @type {Array<{ heading: string, rows: object[] }>} */
  const groups = [];
  for (const type of POWER_TYPE_ORDER) {
    const list = buckets.get(type);
    if (list.length) groups.push({ heading: type, rows: list });
  }
  if (other.length) groups.push({ heading: 'Other', rows: other });
  return groups;
}

/**
 * @param {{ href: string, ariaLabel: string, text?: string }} link
 */
function renderGrantLink(link) {
  const visible = link.text
    ? `<span aria-hidden="true">↗</span> ${esc(link.text)}`
    : '↗';
  return `<a
    class="character-collection-open power-slot-open"
    href="${esc(link.href)}"
    target="_blank"
    rel="noopener noreferrer"
    title="${esc(link.ariaLabel)}"
    aria-label="${esc(link.ariaLabel)}"
  >${visible}</a>`;
}

/**
 * @param {{ name: string, meta: string, links: Array<{ href: string, ariaLabel: string, text?: string }> }} row
 */
function renderGrantRow(row) {
  const links = (row.links ?? []).map(renderGrantLink).join('');
  const linksHtml = (row.links ?? []).length > 1 ? `<div class="power-grant-links">${links}</div>` : links;
  return `<div class="power-slot-row-wrap power-grant-row">
    <div class="${pickerCardClass(false)} power-grant-slot" role="group" aria-readonly="true">
      <span class="block">${esc(row.name)}</span>
      <span class="block text-sm font-normal text-slate-400">${esc(row.meta)}</span>
    </div>
    ${linksHtml}
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
