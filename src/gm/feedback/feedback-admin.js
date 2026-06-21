import { isGmSession } from '../../api/campaign-api.js';
import { escapeHtml } from '../../shared/escape-html.js';
import {
  listFeedback,
  getFeedbackStats,
  setFeedbackStatus,
  deleteFeedback
} from '../../api/feedback-api.js';

const $ = (sel) => document.querySelector(sel);

const CATEGORY_LABELS = {
  bug: 'Problem / bug',
  stuck: 'Got stuck',
  wrong: 'Wrong',
  missing: 'Missing',
  feature: 'Feature wish',
  different: 'Do differently'
};

const STATUS_LABELS = {
  open: 'Open',
  triaged: 'Triaged',
  resolved: 'Resolved',
  wontfix: "Won't fix"
};

const STATUS_ORDER = ['open', 'triaged', 'resolved', 'wontfix'];

function showErrors(messages) {
  const box = $('#fb-errors');
  if (!box) return;
  if (!messages.length) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  box.hidden = false;
  box.innerHTML = messages.map((m) => `<li>${escapeHtml(m)}</li>`).join('');
}

function labelFor(map, key) {
  return map[key] ?? key ?? 'unspecified';
}

function renderStatCard(title, rows, labelMap) {
  const items = rows.length
    ? rows
        .map(
          (row) =>
            `<li><span>${escapeHtml(labelMap ? labelFor(labelMap, row[Object.keys(row)[0]]) : row[Object.keys(row)[0]])}</span><strong>${row.count}</strong></li>`
        )
        .join('')
    : '<li class="fb-empty">No data yet</li>';
  return `
    <div class="fb-stat-card">
      <h3>${escapeHtml(title)}</h3>
      <ul class="fb-stat-list">${items}</ul>
    </div>`;
}

function renderTopRecurring(rows) {
  const items = rows.length
    ? rows
        .map(
          (row) =>
            `<li><span>${escapeHtml(labelFor(CATEGORY_LABELS, row.category))} · ${escapeHtml(row.area)}</span><strong>${row.count}</strong></li>`
        )
        .join('')
    : '<li class="fb-empty">No data yet</li>';
  return `
    <div class="fb-stat-card">
      <h3>Most recurring (category · area)</h3>
      <ul class="fb-stat-list">${items}</ul>
    </div>`;
}

async function renderStats() {
  const grid = $('#fb-stats-grid');
  const summary = $('#fb-stats-summary');
  try {
    const stats = await getFeedbackStats();
    summary.textContent = `${stats.total} total · ${stats.last30Days} in the last 30 days`;
    grid.innerHTML = [
      renderStatCard('By category', stats.byCategory, CATEGORY_LABELS),
      renderStatCard('By status', stats.byStatus, STATUS_LABELS),
      renderStatCard('By area', stats.byArea, null),
      renderTopRecurring(stats.topRecurring)
    ].join('');
  } catch (err) {
    summary.textContent = `Could not load statistics: ${err?.message ?? 'unknown error'}`;
    grid.innerHTML = '';
  }
}

function statusSelect(entry) {
  const options = STATUS_ORDER.map(
    (value) =>
      `<option value="${value}"${value === entry.status ? ' selected' : ''}>${STATUS_LABELS[value]}</option>`
  ).join('');
  return `<select class="fb-status-select" data-id="${escapeHtml(entry.id)}" aria-label="Change status">${options}</select>`;
}

function renderEntry(entry) {
  const created = entry.createdAt ? new Date(entry.createdAt).toLocaleString() : '';
  const metaParts = [
    labelFor(CATEGORY_LABELS, entry.category),
    entry.area || null,
    entry.severity ? `severity: ${entry.severity}` : null,
    entry.role || null,
    entry.appVersion ? `v${entry.appVersion}` : null
  ].filter(Boolean);
  const contact = entry.contact
    ? `<p class="fb-entry-contact">Contact: ${escapeHtml(entry.contact)}</p>`
    : '';
  return `
    <article class="fb-entry fb-entry--${escapeHtml(entry.category)}" data-id="${escapeHtml(entry.id)}">
      <header class="fb-entry-head">
        <h4 class="fb-entry-title">${escapeHtml(entry.title)}</h4>
        <span class="fb-entry-date">${escapeHtml(created)}</span>
      </header>
      <p class="fb-entry-meta">${escapeHtml(metaParts.join(' · '))}</p>
      <p class="fb-entry-message">${escapeHtml(entry.message)}</p>
      ${contact}
      <div class="fb-entry-actions">
        ${statusSelect(entry)}
        <button type="button" class="btn-secondary fb-delete" data-id="${escapeHtml(entry.id)}">Delete</button>
      </div>
    </article>`;
}

async function renderList() {
  const listEl = $('#fb-list');
  listEl.textContent = 'Loading…';
  try {
    const entries = await listFeedback({
      category: $('#fb-filter-category').value || undefined,
      status: $('#fb-filter-status').value || undefined
    });
    if (!entries.length) {
      listEl.innerHTML = '<p class="fb-empty">No feedback entries match this filter.</p>';
      return;
    }
    listEl.innerHTML = entries.map(renderEntry).join('');
    wireEntryActions();
  } catch (err) {
    listEl.innerHTML = '';
    showErrors([`Could not load entries: ${err?.message ?? 'unknown error'}`]);
  }
}

function wireEntryActions() {
  document.querySelectorAll('.fb-status-select').forEach((sel) => {
    sel.addEventListener('change', async (event) => {
      const target = event.currentTarget;
      const id = target.getAttribute('data-id');
      try {
        await setFeedbackStatus(id, target.value);
        showErrors([]);
        await renderStats();
      } catch (err) {
        showErrors([`Could not update status: ${err?.message ?? 'unknown error'}`]);
      }
    });
  });

  document.querySelectorAll('.fb-delete').forEach((btn) => {
    btn.addEventListener('click', async (event) => {
      const id = event.currentTarget.getAttribute('data-id');
      if (!window.confirm('Delete this feedback entry permanently?')) return;
      try {
        await deleteFeedback(id);
        showErrors([]);
        await Promise.all([renderStats(), renderList()]);
      } catch (err) {
        showErrors([`Could not delete entry: ${err?.message ?? 'unknown error'}`]);
      }
    });
  });
}

function init() {
  if (!isGmSession()) {
    $('#fb-no-session').hidden = false;
    return;
  }
  $('#fb-workspace').hidden = false;
  $('#fb-refresh')?.addEventListener('click', () => {
    renderStats();
    renderList();
  });
  $('#fb-filter-category')?.addEventListener('change', renderList);
  $('#fb-filter-status')?.addEventListener('change', renderList);
  renderStats();
  renderList();
}

init();
