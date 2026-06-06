import { initBuildStamp } from '../shared/build-stamp.js';
import { joinCampaign } from '../api/campaign-api.js';
import { enablePlayerMode } from '../player-mode.js';

initBuildStamp();

const statusEl = document.getElementById('join-status');
const errorEl = document.getElementById('join-error');

function showError(message) {
  statusEl.textContent = 'Could not join campaign';
  errorEl.textContent = message;
  errorEl.hidden = false;
}

const params = new URLSearchParams(location.search);
const campaignId = params.get('c');
const token = params.get('t');

if (campaignId && token) {
  try {
    joinCampaign(campaignId, token);
    enablePlayerMode();
    statusEl.textContent = 'Joined! Opening player tools…';
    window.location.replace('../player/index.html');
  } catch (err) {
    showError(err.message ?? String(err));
  }
} else {
  showError('This link is missing campaign details. Ask your GM for a new invite link.');
}
