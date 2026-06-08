import { initBuildStamp } from '../shared/build-stamp.js';
import { enablePlayerMode, syncPlayerModeFromUrl, withPlayerMode } from '../player-mode.js';
import { getSessionCampaign } from '../api/campaign-api.js';

initBuildStamp();
syncPlayerModeFromUrl();
enablePlayerMode();

const genLink = document.getElementById('link-character-generator');
if (genLink) genLink.href = withPlayerMode('/editor/');

const sheetLink = document.getElementById('link-character-sheet');
if (sheetLink) sheetLink.href = withPlayerMode('/sheet/');

const status = document.getElementById('player-campaign-status');
const session = getSessionCampaign();
if (session?.role === 'player' && status) {
  status.textContent = `Joined campaign: ${session.name}`;
  status.classList.remove('hidden');
}
