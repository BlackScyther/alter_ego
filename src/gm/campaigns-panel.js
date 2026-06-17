import { escapeHtml } from '../shared/escape-html.js';
import {
  createCampaign,
  activateGmCampaign,
  getSessionCampaign,
  isGmSession,
  listCampaignCharacters
} from '../api/campaign-api.js';
import { addGmCampaign, listGmCampaigns } from '../api/gm-campaign-registry.js';

const $ = (sel, root = document) => root.querySelector(sel);

let pollTimer = null;

function syncSessionToRegistry() {
  const session = getSessionCampaign();
  if (!session || session.role !== 'gm') return;
  const existing = listGmCampaigns().some((c) => c.campaignId === session.campaignId);
  if (existing) return;
  addGmCampaign({
    campaignId: session.campaignId,
    name: session.name,
    gmToken: session.token,
    playerToken: '',
    inviteUrl: session.inviteUrl,
    createdAt: new Date().toISOString()
  });
}

function renderActiveBody(campaign, partyStatusText) {
  return `
    <p class="text-sm text-slate-400 mt-0 mb-2">Share this link with players (WhatsApp, email, …):</p>
    <div class="flex flex-wrap gap-2">
      <input
        type="text"
        readonly
        class="gm-campaign-invite flex-1 min-w-0 rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
        value="${escapeHtml(campaign.inviteUrl || '')}"
      />
      <button type="button" class="btn-secondary min-h-11 gm-campaign-copy" data-campaign-id="${escapeHtml(campaign.campaignId)}">
        Copy link
      </button>
    </div>
    <p class="gm-campaign-party-status text-sm text-slate-400 mt-3 m-0">${escapeHtml(partyStatusText)}</p>
  `;
}

function renderCampaignList(partyStatusText = '') {
  const list = $('#gm-campaign-list');
  if (!list) return;

  const session = getSessionCampaign();
  const activeId = session?.role === 'gm' ? session.campaignId : null;
  const campaigns = listGmCampaigns();

  if (!campaigns.length) {
    list.innerHTML = `
      <p class="gm-campaign-empty text-sm text-slate-400 m-0 mb-3">
        No campaigns yet. Create one below.
      </p>`;
    return;
  }

  list.innerHTML = campaigns
    .map((campaign) => {
      const isActive = campaign.campaignId === activeId;
      const body =
        isActive
          ? renderActiveBody(
              { ...campaign, inviteUrl: session?.inviteUrl || campaign.inviteUrl },
              partyStatusText
            )
          : `<p class="text-sm text-slate-500 m-0 mb-3">Not active in this browser tab.</p>
             <button type="button" class="btn-primary min-h-11 gm-campaign-activate" data-campaign-id="${escapeHtml(campaign.campaignId)}">
               Use this campaign
             </button>`;

      return `
        <details class="gm-campaign-item${isActive ? ' gm-campaign-item--active' : ''}" data-campaign-id="${escapeHtml(campaign.campaignId)}"${isActive ? ' open' : ''}>
          <summary class="gm-campaign-item-summary">
            <span class="gm-campaign-item-name">${escapeHtml(campaign.name)}</span>
            ${isActive ? '<span class="gm-campaign-active-badge">Active</span>' : ''}
          </summary>
          <div class="gm-campaign-body">${body}</div>
        </details>`;
    })
    .join('');

  if (!activeId && campaigns.length) {
    list.insertAdjacentHTML(
      'beforeend',
      `<p class="gm-campaign-hint text-sm text-slate-500 mt-2 mb-0">
        Open a campaign and choose <strong>Use this campaign</strong> to run Encounters and edit Workshop entries.
      </p>`
    );
  }

  for (const btn of list.querySelectorAll('.gm-campaign-activate')) {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-campaign-id');
      if (!id) return;
      try {
        activateGmCampaign(id);
        const cta = document.querySelector('#gm-encounter-cta');
        if (cta) cta.hidden = false;
        reloadOnlineParty();
        startPolling();
        showPanelMessage(['Campaign activated. Open Encounters or Workshop.']);
      } catch (err) {
        showPanelMessage([err.message ?? String(err)]);
      }
    });
  }

  for (const btn of list.querySelectorAll('.gm-campaign-copy')) {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-campaign-id');
      const campaign = listGmCampaigns().find((c) => c.campaignId === id);
      const url = campaign?.inviteUrl || getSessionCampaign()?.inviteUrl || '';
      if (!url) return;
      try {
        await navigator.clipboard.writeText(url);
        showPanelMessage(['Invite link copied.']);
      } catch {
        showPanelMessage(['Could not copy — select the link and copy manually.']);
      }
    });
  }
}

let showPanelMessage = () => {};

async function reloadOnlineParty() {
  if (!isGmSession()) {
    renderCampaignList('');
    return;
  }
  let partyStatusText = '';
  try {
    const data = await listCampaignCharacters();
    const count = (data.characters ?? []).length;
    partyStatusText = count
      ? `${count} character(s) — add them in Encounters.`
      : 'No player characters saved yet.';
    showPanelMessage([]);
  } catch (err) {
    partyStatusText = 'Could not load campaign party';
    showPanelMessage([err.message ?? String(err)]);
  }
  renderCampaignList(partyStatusText);
}

function startPolling() {
  stopPolling();
  if (!isGmSession()) return;
  pollTimer = setInterval(() => {
    reloadOnlineParty();
  }, 8000);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

/**
 * @param {{ showErrors: (messages: string[]) => void }} opts
 */
export function initCampaignsPanel({ showErrors }) {
  showPanelMessage = showErrors;
  syncSessionToRegistry();
  renderCampaignList('');

  const cta = document.querySelector('#gm-encounter-cta');
  if (cta) cta.hidden = !isGmSession();

  const btnCreate = $('#btn-create-campaign');
  const nameInput = $('#campaign-name');

  btnCreate?.addEventListener('click', async () => {
    const name = nameInput?.value.trim() || 'Our campaign';
    try {
      await createCampaign(name);
      renderCampaignList('');
      if (cta) cta.hidden = false;
      await reloadOnlineParty();
      startPolling();
      showPanelMessage(['Campaign created. Copy the invite link for players.']);
    } catch (err) {
      showPanelMessage([err.message ?? String(err)]);
    }
  });

  if (isGmSession()) {
    reloadOnlineParty();
    startPolling();
  }

  return { reloadOnlineParty, stopPolling };
}
