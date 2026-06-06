import { initBuildStamp } from '../shared/build-stamp.js';
import { enablePlayerMode, syncPlayerModeFromUrl } from '../player-mode.js';
import { getSessionCampaign } from '../api/campaign-api.js';

initBuildStamp();
syncPlayerModeFromUrl();
enablePlayerMode();

const status = document.getElementById('player-campaign-status');
const session = getSessionCampaign();
if (session?.role === 'player' && status) {
  status.textContent = `Joined campaign: ${session.name}`;
  status.classList.remove('hidden');
}
