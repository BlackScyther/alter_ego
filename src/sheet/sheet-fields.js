/**
 * Read-only character sheet cells. No character-model imports, so the sheet
 * page can load this without the compendium or override JSON.
 */

const POWER_GROUPS = [
  { id: 'utility', label: 'Utility', test: /utility/i },
  { id: 'daily', label: 'Daily', test: /daily/i },
  { id: 'encounter', label: 'Encounter', test: /\bencounter\b|\benc\b/i },
  { id: 'at-will', label: 'At-Will', test: /at-?\s*will/i },
  { id: 'other', label: 'Other', test: null }
];

/**
 * @param {string | undefined | null} text
 */
function noteLines(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * @param {string} line
 * @returns {{ group: string, name: string }}
 */
function classifyPowerLine(line) {
  const colon = line.indexOf(':');
  let name = line;
  let hint = line;
  if (colon > 0 && colon < 48) {
    hint = line.slice(0, colon);
    name = line.slice(colon + 1).trim() || line;
  }
  for (const group of POWER_GROUPS) {
    if (group.test && (group.test.test(hint) || group.test.test(line))) {
      return { group: group.id, name };
    }
  }
  return { group: 'other', name };
}

/**
 * Power names for the printable index, grouped by usage.
 * @param {{ powers?: string, racialPowers?: string, classPowers?: string, themePowers?: string } | undefined} notes
 * @returns {{ id: string, label: string, items: string[] }[]}
 */
export function buildPowerIndex(notes) {
  const buckets = new Map(POWER_GROUPS.map((group) => [group.id, []]));
  const seen = new Set();
  const add = (line) => {
    const parsed = classifyPowerLine(line);
    const key = parsed.name.toLowerCase();
    if (!parsed.name || seen.has(key)) return;
    seen.add(key);
    buckets.get(parsed.group).push(parsed.name);
  };
  for (const line of noteLines(notes?.powers)) add(line);
  for (const line of noteLines(notes?.racialPowers)) add(line);
  for (const line of noteLines(notes?.classPowers)) add(line);
  for (const line of noteLines(notes?.themePowers)) add(line);
  return POWER_GROUPS
    .map((group) => ({ id: group.id, label: group.label, items: buckets.get(group.id) }))
    .filter((group) => group.items.length);
}

/**
 * Write one sheet cell. Numbers and text land in `textContent`. Marks use a
 * filled square. Power and equipment indexes build their own lists.
 * @param {HTMLElement | null} el
 * @param {unknown} value
 */
export function writeSheetField(el, value) {
  if (!el || value === undefined || value === null) return;
  if (el.dataset.render === 'power-index' && Array.isArray(value)) {
    renderPowerIndex(el, value);
    return;
  }
  if (el.dataset.render === 'equipped-lines') {
    renderEquippedLines(el, value);
    return;
  }
  if (el.classList.contains('sheet-mark')) {
    const on = value === true || value === 1 || value === '1' || value === 'true';
    el.dataset.value = on ? '1' : '0';
    el.classList.toggle('is-on', on);
    el.setAttribute('aria-checked', on ? 'true' : 'false');
    return;
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = Boolean(value);
    else el.value = String(value);
    return;
  }
  const text = String(value);
  el.dataset.value = text;
  el.textContent = text;
}

/**
 * @param {HTMLElement} el
 * @param {{ id: string, label: string, items: string[] }[]} groups
 */
function renderPowerIndex(el, groups) {
  el.replaceChildren();
  for (const group of groups) {
    if (!group.items?.length) continue;
    const block = document.createElement('div');
    block.className = 'index-group';
    const title = document.createElement('div');
    title.className = 'sheet-label index-group-title';
    title.textContent = group.label;
    block.appendChild(title);
    const list = document.createElement('ul');
    list.className = 'index-list';
    for (const name of group.items) {
      const item = document.createElement('li');
      const mark = document.createElement('span');
      mark.className = 'sheet-mark';
      mark.setAttribute('aria-label', 'Used');
      const label = document.createElement('span');
      label.className = 'sheet-val sheet-text index-name';
      label.textContent = name;
      item.append(mark, label);
      list.appendChild(item);
    }
    block.appendChild(list);
    el.appendChild(block);
  }
}

/**
 * @param {HTMLElement} el
 * @param {unknown} value
 */
function renderEquippedLines(el, value) {
  el.replaceChildren();
  const lines = String(value ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return;
  const list = document.createElement('ul');
  list.className = 'index-list';
  for (const line of lines) {
    const item = document.createElement('li');
    const mark = document.createElement('span');
    mark.className = 'sheet-mark';
    mark.setAttribute('aria-label', 'Used');
    const label = document.createElement('span');
    label.className = 'sheet-val sheet-text index-name';
    label.textContent = line;
    item.append(mark, label);
    list.appendChild(item);
  }
  el.appendChild(list);
}
