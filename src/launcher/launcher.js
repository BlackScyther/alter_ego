import { initBuildStamp } from '../shared/build-stamp.js';

initBuildStamp();

const REMEMBER_KEY = 'dnd4e.rememberRole';
const PREFERRED_KEY = 'dnd4e.preferredRole';

function roleHref(role) {
  return role === 'gm' ? '../gm/index.html' : '../player/index.html';
}

function maybeAutoRedirect() {
  try {
    if (localStorage.getItem(REMEMBER_KEY) !== '1') return;
    const role = localStorage.getItem(PREFERRED_KEY);
    if (role === 'player' || role === 'gm') {
      window.location.replace(roleHref(role));
    }
  } catch {
    /* ignore */
  }
}

function rememberRole(role) {
  try {
    localStorage.setItem(PREFERRED_KEY, role);
    localStorage.setItem(REMEMBER_KEY, '1');
  } catch {
    /* ignore */
  }
}

maybeAutoRedirect();

document.getElementById('btn-player')?.addEventListener('click', () => {
  if (document.getElementById('remember-role')?.checked) rememberRole('player');
});
document.getElementById('btn-gm')?.addEventListener('click', () => {
  if (document.getElementById('remember-role')?.checked) rememberRole('gm');
});

const rememberBox = document.getElementById('remember-role');
if (rememberBox) {
  try {
    rememberBox.checked = localStorage.getItem(REMEMBER_KEY) === '1';
  } catch {
    /* ignore */
  }
}
