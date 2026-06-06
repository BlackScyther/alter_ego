import { ensureVersionBadge } from './version-badge.js';

/** Attach version badge (live build-stamp equivalent). */
export function initBuildStamp() {
  ensureVersionBadge();
}
