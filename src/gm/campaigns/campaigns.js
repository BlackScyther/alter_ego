import { initBuildStamp } from '../../shared/build-stamp.js';
import { escapeHtml } from '../../shared/escape-html.js';
import { initCampaignsPanel } from '../campaigns-panel.js';

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

initCampaignsPanel({ showErrors });
