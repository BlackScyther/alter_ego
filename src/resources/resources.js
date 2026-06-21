/**
 * Player resources page: shared, character-independent reference.
 *
 * Renders the Level 1-30 values table (pure formula), a formula key (static
 * HTML), and the universal actions every character can use (hydrated from
 * metadata/universal-actions.json via the compendium). A Print button opens a
 * section-picker dialog, then prints only the chosen sections.
 */

import { compendium } from '../data/compendium.js';
import { buildLevelTable } from '../formulas.js';
import { loadUniversalActionsMeta } from '../editor/steps/power-collection-panel.js';
import { condenseRuleHtml } from '../ui/condense-rule-text.js';
import { escapeHtml } from '../shared/escape-html.js';
import { initBuildStamp } from '../shared/build-stamp.js';
import { openPrintResourcesDialog } from './print-resources-dialog.js';

initBuildStamp();

function renderLevelTable() {
  const tbody = document.getElementById('level-table-body');
  if (!tbody) return;
  tbody.innerHTML = buildLevelTable(30)
    .map(
      (r) => `<tr>
        <td>${r.level}</td>
        <td class="tier">${r.tier}</td>
        <td>${r.halfLevel}</td>
        <td>${r.defenseBase}</td>
        <td>${r.xp.toLocaleString()}</td>
        <td>+${r.modPlusHalfAt10}</td>
      </tr>`
    )
    .join('');
}

async function renderUniversalActions() {
  const host = document.getElementById('universal-actions');
  if (!host) return;
  try {
    await compendium.ready();
    const meta = await loadUniversalActionsMeta();
    const groups = Array.isArray(meta.groups) ? meta.groups : [];
    const resolved = Array.isArray(meta.resolved) ? meta.resolved : [];
    if (!groups.length || !resolved.length) {
      host.innerHTML =
        '<p class="resources-empty">Universal actions are unavailable (compendium not loaded).</p>';
      return;
    }

    const blocks = [];
    for (const group of groups) {
      const items = resolved.filter((r) => r.groupId === group.id);
      const actions = [];
      for (const item of items) {
        const entry = await compendium.getEntry(item.id);
        const name = entry?.listing_fields?.Name ?? item.name ?? item.id;
        const body = condenseRuleHtml(entry);
        actions.push(`
          <article class="resources-action">
            <h4 class="resources-action-name">${escapeHtml(name)}</h4>
            <div class="resources-action-body entry-preview">${
              body || '<p class="resources-empty">No rule text available.</p>'
            }</div>
          </article>`);
      }
      if (actions.length) {
        blocks.push(`
          <section class="resources-universal-group">
            <h3 class="resources-universal-group-title">${escapeHtml(group.label ?? 'Actions')}</h3>
            <div class="resources-universal-grid">${actions.join('')}</div>
          </section>`);
      }
    }

    host.innerHTML = blocks.join('') || '<p class="resources-empty">No universal actions found.</p>';
  } catch (err) {
    host.innerHTML = `<p class="resources-empty">Universal actions failed to load: ${escapeHtml(
      err?.message ?? String(err)
    )}</p>`;
  }
}

function wirePrint() {
  const btn = document.getElementById('btn-print');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const selected = await openPrintResourcesDialog();
    if (selected === null) return;

    const sections = [...document.querySelectorAll('[data-section]')];
    const restore = () => sections.forEach((s) => s.classList.remove('no-print'));
    for (const s of sections) {
      s.classList.toggle('no-print', !selected.includes(s.dataset.section));
    }
    window.addEventListener('afterprint', restore, { once: true });
    window.print();
    // Fallback restore in case afterprint never fires (e.g. dialog cancelled).
    setTimeout(restore, 1000);
  });
}

renderLevelTable();
wirePrint();
renderUniversalActions();
