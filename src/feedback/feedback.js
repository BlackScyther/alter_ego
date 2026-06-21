import { submitFeedback } from '../api/feedback-api.js';
import { getSessionCampaign } from '../api/campaign-api.js';

const form = document.getElementById('feedback-form');
const errorsEl = document.getElementById('feedback-errors');
const statusEl = document.getElementById('feedback-status');
const submitBtn = document.getElementById('feedback-submit');
const statsLink = document.getElementById('feedback-stats-link');

const session = getSessionCampaign();
const role = session?.role === 'gm' ? 'gm' : session?.role === 'player' ? 'player' : null;
const appVersion = import.meta.env.VITE_APP_VERSION ?? '';

if (role === 'gm' && statsLink) {
  statsLink.classList.remove('hidden');
}

function showErrors(messages) {
  errorsEl.innerHTML = '';
  if (!messages.length) {
    errorsEl.hidden = true;
    return;
  }
  for (const message of messages) {
    const li = document.createElement('li');
    li.textContent = message;
    errorsEl.appendChild(li);
  }
  errorsEl.hidden = false;
}

function clientErrors(payload) {
  const errors = [];
  if (!payload.category) errors.push('Please choose a feedback type.');
  if (!payload.title) errors.push('Please enter a short title.');
  if (!payload.message) errors.push('Please enter some details.');
  return errors;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  statusEl.textContent = '';
  statusEl.classList.remove('feedback-status--error');

  const payload = {
    category: form.querySelector('input[name="category"]:checked')?.value ?? '',
    title: document.getElementById('feedback-title').value.trim(),
    message: document.getElementById('feedback-message').value.trim(),
    area: document.getElementById('feedback-area').value || undefined,
    severity: document.getElementById('feedback-severity').value || undefined,
    contact: document.getElementById('feedback-contact').value.trim() || undefined,
    role: role || undefined,
    appVersion: appVersion || undefined
  };

  const errors = clientErrors(payload);
  if (errors.length) {
    showErrors(errors);
    return;
  }
  showErrors([]);

  submitBtn.disabled = true;
  statusEl.textContent = 'Sending…';
  try {
    await submitFeedback(payload);
    form.reset();
    statusEl.textContent = 'Thank you! Your feedback was sent.';
  } catch (err) {
    statusEl.textContent =
      'Could not send feedback. The server may be offline (this needs an online connection). ' +
      (err?.message ?? '');
    statusEl.classList.add('feedback-status--error');
  } finally {
    submitBtn.disabled = false;
  }
});
