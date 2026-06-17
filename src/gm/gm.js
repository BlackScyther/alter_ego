import { initBuildStamp } from '../shared/build-stamp.js';
import { saveCharacter } from '../character/store.js';
import { buildQuickCharacter } from '../character/quick-build.js';
import { compendium } from '../data/compendium.js';
import { getSessionCampaign, isGmSession } from '../api/campaign-api.js';
import { getGmCampaignStats } from '../api/gm-campaign-registry.js';
import { escapeHtml } from '../shared/escape-html.js';

initBuildStamp();

const $ = (sel) => document.querySelector(sel);

function showErrors(messages) {
  const box = $('#gm-errors');
  if (!messages.length) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  box.hidden = false;
  box.innerHTML = messages.map((m) => `<li>${escapeHtml(m)}</li>`).join('');
}

function renderCampaignStats() {
  const el = $('#gm-campaign-stats-text');
  if (!el) return;
  const { total, active } = getGmCampaignStats(undefined, { activeGmSession: isGmSession() });
  if (total === 0) {
    el.textContent = 'No campaigns created yet.';
    return;
  }
  const createdLabel = total === 1 ? '1 campaign created' : `${total} campaigns created`;
  const activeLabel = active === 1 ? '1 active' : 'none active';
  el.textContent = `${createdLabel} · ${activeLabel}`;
}

renderCampaignStats();
window.addEventListener('storage', (e) => {
  if (e.key === 'dnd4e.gm.campaigns') renderCampaignStats();
});
window.addEventListener('focus', renderCampaignStats);

$('#btn-quick-build').addEventListener('click', async () => {
  try {
    await compendium.ready();
    const session = getSessionCampaign();
    const character = await buildQuickCharacter({
      race: $('#qb-race').value,
      class: $('#qb-class').value,
      level: $('#qb-level').value,
      characterName: $('#qb-name').value,
      campaignId: session?.campaignId ?? null
    });
    const saved = saveCharacter(character);
    window.location.href = `../editor/index.html?id=${encodeURIComponent(saved.id)}`;
  } catch (err) {
    showErrors([err.message ?? String(err)]);
  }
});
