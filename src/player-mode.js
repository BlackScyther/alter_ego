const PLAYER_MODE_KEY = 'dnd4e.playerMode';
const PLAYER_MODE_QUERY = 'player';

export { PLAYER_MODE_KEY, PLAYER_MODE_QUERY };

export function isPlayerMode() {
  if (new URLSearchParams(location.search).get('mode') === PLAYER_MODE_QUERY) return true;
  try {
    return sessionStorage.getItem(PLAYER_MODE_KEY) === '1';
  } catch {
    return false;
  }
}

export function enablePlayerMode() {
  try {
    sessionStorage.setItem(PLAYER_MODE_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function syncPlayerModeFromUrl() {
  if (new URLSearchParams(location.search).get('mode') === PLAYER_MODE_QUERY) {
    enablePlayerMode();
  }
}

export function withPlayerMode(href) {
  if (!isPlayerMode()) return href;
  const sep = href.includes('?') ? '&' : '?';
  return `${href}${sep}mode=${PLAYER_MODE_QUERY}`;
}

export function applyPlayerNav({ homeLink = null, hideGm = true } = {}) {
  if (!isPlayerMode()) return;
  if (homeLink) {
    homeLink.href = '../player/index.html';
    const label = homeLink.dataset.playerLabel;
    if (label) homeLink.textContent = label;
  }
  if (hideGm) {
    document.querySelectorAll('.nav-gm-only').forEach((el) => {
      el.hidden = true;
      el.setAttribute('aria-hidden', 'true');
    });
  }
}
