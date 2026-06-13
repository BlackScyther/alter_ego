const CHOICE_TARGET_SELECTOR = [
  '[data-choice-guide="race-bonus"]',
  '[data-choice-guide="race-build"]',
  '[data-choice-guide="class-build"]',
  '[data-choice-guide="class-skill"]'
].join(', ');

const ACTIVE_CLASS = 'choice-guide--active';
const ACTIVE_ANCHOR_ID = 'choice-guide-active';

/**
 * @param {Element} el
 */
function isInlineChoicesComplete(el) {
  const guide = el.dataset.choiceGuide;
  if (guide === 'class-skill') {
    const required = Number(el.dataset.chooseCount ?? 0);
    if (required <= 0) return true;
    const selected = el.querySelectorAll('.race-choice-btn--selected').length;
    return selected >= required;
  }
  return el.querySelector('.race-choice-btn--selected') != null;
}

/**
 * @param {Element} el
 */
function isBuildFieldsetComplete(el) {
  return el.querySelector('input[type="radio"]:checked') != null;
}

/**
 * @param {Element} el
 */
function isChoiceTargetComplete(el) {
  if (el.matches('.race-build-fieldset, [data-choice-guide="race-build"]')) {
    return isBuildFieldsetComplete(el);
  }
  if (el.matches('.race-inline-choices, [data-choice-guide]')) {
    return isInlineChoicesComplete(el);
  }
  return true;
}

/**
 * @param {ParentNode | null | undefined} root
 * @returns {HTMLElement[]}
 */
export function scanPendingChoiceTargets(root) {
  if (!root || !(root instanceof Element || root instanceof DocumentFragment)) return [];
  const scope = root instanceof DocumentFragment ? root : root;
  const nodes = scope.querySelectorAll?.(CHOICE_TARGET_SELECTOR);
  if (!nodes?.length) return [];

  /** @type {HTMLElement[]} */
  const pending = [];
  for (const el of nodes) {
    if (!(el instanceof HTMLElement)) continue;
    if (!isChoiceTargetComplete(el)) pending.push(el);
  }
  return pending;
}

/**
 * @param {HTMLElement} el
 */
function describeIdForTarget(el) {
  if (el.id && el.id.startsWith('choice-guide-')) return el.id;
  const guide = el.dataset.choiceGuide ?? 'choice';
  const decisionId = el.dataset.decisionId;
  const kind = el.dataset.kind;
  const group = el.dataset.choiceGroup;
  if (decisionId) return `choice-guide-${guide}-${decisionId}`;
  if (kind && group) return `choice-guide-${guide}-${kind}-${group}`;
  return `choice-guide-${guide}`;
}

/**
 * @param {HTMLElement} el
 */
function firstFocusableInTarget(el) {
  return (
    el.querySelector('button.race-choice-btn:not([disabled])') ??
    el.querySelector('input[type="radio"]:not([disabled])') ??
    el.querySelector('button:not([disabled])') ??
    el.querySelector('input:not([disabled])')
  );
}

/**
 * @param {HTMLElement} el
 */
function linkAriaDescription(el) {
  const legend = el.querySelector('legend');
  if (legend?.id) {
    el.setAttribute('aria-describedby', legend.id);
    return;
  }
  const section = el.closest('section');
  const heading = section?.querySelector('.background-section-title, .race-section-title, h3');
  if (heading) {
    if (!heading.id) heading.id = `${describeIdForTarget(el)}-label`;
    el.setAttribute('aria-describedby', heading.id);
    return;
  }
  el.removeAttribute('aria-describedby');
}

/**
 * @param {ParentNode | null | undefined} root
 */
function clearChoiceGuide(root) {
  if (!root || !('querySelectorAll' in root)) return;
  root.querySelectorAll(`.${ACTIVE_CLASS}`).forEach((el) => {
    el.classList.remove(ACTIVE_CLASS);
    el.removeAttribute('tabindex');
    el.removeAttribute('aria-describedby');
    if (el.id === ACTIVE_ANCHOR_ID) el.removeAttribute('id');
  });
}

/**
 * @param {ParentNode | null | undefined} root
 * @param {{ scroll?: boolean, focus?: boolean }} [opts]
 * @returns {HTMLElement | null}
 */
export function applyChoiceGuide(root, opts = {}) {
  const { scroll = true, focus = true } = opts;
  if (!root) return null;

  clearChoiceGuide(root);
  const pending = scanPendingChoiceTargets(root);
  const active = pending[0] ?? null;
  if (!active) return null;

  active.classList.add(ACTIVE_CLASS);
  active.id = ACTIVE_ANCHOR_ID;
  active.setAttribute('tabindex', '-1');
  linkAriaDescription(active);

  if (scroll) {
    requestAnimationFrame(() => {
      active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }

  if (focus) {
    requestAnimationFrame(() => {
      const target = firstFocusableInTarget(active);
      if (target instanceof HTMLElement) target.focus({ preventScroll: true });
      else active.focus({ preventScroll: true });
    });
  }

  return active;
}

/**
 * @param {ParentNode | null | undefined} root
 * @returns {HTMLElement | null}
 */
export function focusPendingChoice(root) {
  return applyChoiceGuide(root, { scroll: true, focus: true });
}
