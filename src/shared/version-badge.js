function buildVersionText() {
  const version = import.meta.env.VITE_APP_VERSION ?? '';
  const branch = import.meta.env.VITE_GIT_BRANCH ?? '';
  const sha = import.meta.env.VITE_GIT_SHA ?? '';

  const parts = [];
  if (version) parts.push(`v${version}`);
  if (branch && sha) parts.push(`${branch}@${sha}`);
  else if (branch) parts.push(branch);
  else if (sha) parts.push(sha);
  return parts.join(' · ');
}

export function ensureVersionBadge() {
  const text = buildVersionText();
  if (!text) return;

  let badge = document.getElementById('app-version-badge');
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'app-version-badge';
    document.body.appendChild(badge);
  }

  badge.textContent = text;
  badge.style.position = 'fixed';
  badge.style.right = '10px';
  badge.style.bottom = '10px';
  badge.style.zIndex = '2147483647';
  badge.style.fontSize = '12px';
  badge.style.lineHeight = '1.2';
  badge.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
  badge.style.color = 'rgba(148, 163, 184, 0.95)';
  badge.style.background = 'rgba(2, 6, 23, 0.65)';
  badge.style.border = '1px solid rgba(51, 65, 85, 0.8)';
  badge.style.borderRadius = '10px';
  badge.style.padding = '6px 10px';
  badge.style.backdropFilter = 'blur(6px)';
  badge.style.pointerEvents = 'none';
}
