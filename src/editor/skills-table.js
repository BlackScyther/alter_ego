/**
 * Shared skills table markup for the sheet mirror and ability-scores step.
 */

import { SKILLS } from '../formulas.js';
import { escapeHtml as esc } from '../shared/escape-html.js';

const ABIL_LABELS = { str: 'STR', con: 'CON', dex: 'DEX', int: 'INT', wis: 'WIS', cha: 'CHA' };

/**
 * Field map for skill table readonly / wizardReadonly rules.
 */
export function getSkillFieldMap() {
  /** @type {Map<string, { readonly?: boolean, wizardReadonly?: boolean }>} */
  const map = new Map();
  map.set('armor-penalty-global', { readonly: true });
  for (const skill of SKILLS) {
    map.set(`skill-${skill.id}-bonus`, { readonly: true });
    map.set(`skill-${skill.id}-mod-half`, { readonly: true });
    map.set(`skill-${skill.id}-trained`, {});
    if (skill.armorPenalty) map.set(`skill-${skill.id}-pen`, { readonly: true });
    map.set(`skill-${skill.id}-misc`, { wizardReadonly: true });
  }
  return map;
}

/**
 * @param {{ idPrefix?: string }} [opts]
 */
export function renderSkillsTableHtml(opts = {}) {
  const prefix = opts.idPrefix ?? 'mirror';
  const rows = SKILLS.map((skill) => {
    const abil = ABIL_LABELS[skill.ability] ?? skill.ability.toUpperCase();
    const penCell = skill.armorPenalty
      ? `<td class="sheet-mirror-skills-cell">
          <input
            type="number"
            id="${prefix}-skill-${skill.id}-pen"
            class="sheet-mirror-skills-input"
            data-field-id="skill-${skill.id}-pen"
            aria-label="${esc(skill.name)} armor penalty"
            readonly
            aria-readonly="true"
          />
        </td>`
      : `<td class="sheet-mirror-skills-cell sheet-mirror-skills-cell--na" aria-hidden="true">—</td>`;

    return `<tr>
      <th scope="row" class="sheet-mirror-skills-name">
        ${esc(skill.name)}
        <span class="sheet-mirror-skills-abil">${esc(abil)}</span>
      </th>
      <td class="sheet-mirror-skills-cell">
        <input
          type="number"
          id="${prefix}-skill-${skill.id}-bonus"
          class="sheet-mirror-skills-input sheet-mirror-skills-input--total"
          data-field-id="skill-${skill.id}-bonus"
          aria-label="${esc(skill.name)} total bonus"
          readonly
          aria-readonly="true"
        />
      </td>
      <td class="sheet-mirror-skills-cell">
        <input
          type="number"
          id="${prefix}-skill-${skill.id}-mod-half"
          class="sheet-mirror-skills-input"
          data-field-id="skill-${skill.id}-mod-half"
          aria-label="${esc(skill.name)} ability modifier plus half level"
          readonly
          aria-readonly="true"
        />
      </td>
      <td class="sheet-mirror-skills-cell sheet-mirror-skills-cell--check">
        <input
          type="checkbox"
          id="${prefix}-skill-${skill.id}-trained"
          data-field-id="skill-${skill.id}-trained"
          aria-label="${esc(skill.name)} trained (+5)"
        />
      </td>
      ${penCell}
      <td class="sheet-mirror-skills-cell">
        <input
          type="number"
          id="${prefix}-skill-${skill.id}-misc"
          class="sheet-mirror-skills-input"
          data-field-id="skill-${skill.id}-misc"
          aria-label="${esc(skill.name)} miscellaneous bonus"
        />
      </td>
    </tr>`;
  }).join('');

  return `
    <div class="sheet-mirror-skills">
      <label class="sheet-mirror-skills-global" for="${prefix}-armor-penalty-global">
        <span class="sheet-mirror-skills-global-label">Global armor penalty</span>
        <input
          type="number"
          id="${prefix}-armor-penalty-global"
          class="sheet-mirror-skills-input"
          data-field-id="armor-penalty-global"
          readonly
          aria-readonly="true"
        />
      </label>
      <table class="sheet-mirror-skills-table">
        <caption class="visually-hidden">Skill bonuses</caption>
        <thead>
          <tr>
            <th scope="col">Skill</th>
            <th scope="col" title="Total bonus">Total</th>
            <th scope="col" title="Ability modifier plus half level">Abil + ½</th>
            <th scope="col" title="Trained (+5)">Trained</th>
            <th scope="col" title="Armor penalty">Arm</th>
            <th scope="col" title="Miscellaneous bonus">Misc</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

/**
 * @param {object} fieldDef
 * @param {Record<string, unknown>} payload
 * @param {string} fieldId
 */
function isSkillFieldReadonly(fieldDef, payload, fieldId) {
  if (fieldDef?.readonly) return true;
  if (fieldDef?.wizardReadonly) {
    if (/^skill-.+-misc$/.test(fieldId)) {
      return Number(payload[fieldId]) !== 0;
    }
    const val = payload[fieldId];
    if (val !== undefined && val !== null && val !== '') return true;
  }
  return false;
}

/**
 * @param {HTMLElement} root
 * @param {Record<string, unknown>} payload
 * @param {Map<string, object>} [fieldMap]
 * @param {{
 *   trainedReadonly?: boolean,
 *   getTrainedCheckboxState?: (skillId: string) => { editable: boolean, title?: string }
 * }} [opts]
 */
export function populateSkillsTable(root, payload, fieldMap, opts = {}) {
  if (!root) return;
  const activeId = document.activeElement?.dataset?.fieldId;
  const trainedReadonly = Boolean(opts.trainedReadonly);
  const getTrainedCheckboxState = opts.getTrainedCheckboxState;

  for (const input of root.querySelectorAll('[data-field-id]')) {
    const fieldId = input.dataset.fieldId;
    const fieldDef = fieldMap?.get(fieldId);
    const readonly =
      fieldId.endsWith('-bonus') ||
      fieldId.endsWith('-mod-half') ||
      isSkillFieldReadonly(fieldDef, payload, fieldId);

    if (input.type !== 'checkbox') {
      input.readOnly = readonly;
      input.setAttribute('aria-readonly', readonly ? 'true' : 'false');
      input.classList.toggle('sheet-mirror-readonly', readonly);
    } else if (fieldId.endsWith('-trained')) {
      const skillId = fieldId.match(/^skill-(.+)-trained$/)?.[1];
      if (skillId && getTrainedCheckboxState) {
        const ctrl = getTrainedCheckboxState(skillId);
        input.disabled = !ctrl.editable;
        if (ctrl.title) input.title = ctrl.title;
        else input.removeAttribute('title');
      } else if (trainedReadonly) {
        input.disabled = true;
        input.title = 'Change trained skills on the Class step.';
      } else {
        input.disabled = false;
        input.removeAttribute('title');
      }
    }

    if (activeId === fieldId && document.activeElement === input && !readonly) continue;

    const val = payload[fieldId];
    if (input.type === 'checkbox') {
      input.checked = Boolean(val);
    } else if (val !== undefined && val !== null) {
      input.value = val;
    } else if (!readonly) {
      input.value = '';
    }
    rememberLockedSkillValue(input);
  }
}

/**
 * Firefox stepper arrows and the mouse wheel can change a read-only number.
 * Remember the value sheet logic wrote so a stray edit can be put back.
 * @param {HTMLInputElement} input
 */
function rememberLockedSkillValue(input) {
  if (input.type === 'checkbox') return;
  if (input.readOnly || input.getAttribute('aria-readonly') === 'true') {
    input.dataset.lockedValue = input.value;
  } else {
    delete input.dataset.lockedValue;
  }
}

/**
 * @param {HTMLInputElement} input
 */
function restoreLockedSkillValue(input) {
  if (input.dataset.lockedValue == null) return;
  if (input.value !== input.dataset.lockedValue) input.value = input.dataset.lockedValue;
}

/**
 * @param {HTMLInputElement} input
 */
function isLockedSkillNumber(input) {
  return input.type === 'number' && (input.readOnly || input.getAttribute('aria-readonly') === 'true');
}

/**
 * Block Firefox stepper keys on a read-only skill number, and block the mouse
 * wheel on every skill number so scrolling the table does not change Misc.
 * Call once per input.
 * @param {HTMLInputElement} input
 */
export function guardReadonlySkillNumber(input) {
  input.addEventListener('keydown', (event) => {
    if (!isLockedSkillNumber(input)) return;
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') event.preventDefault();
  });
  input.addEventListener(
    'wheel',
    (event) => {
      if (input.type !== 'number') return;
      event.preventDefault();
    },
    { passive: false }
  );
}

/**
 * @param {HTMLElement} root
 * @param {(fieldId: string, value: string|number|boolean) => void} onChange
 */
export function attachSkillsTableHandlers(root, onChange) {
  if (!root || root.dataset.skillsBound) return;
  root.dataset.skillsBound = 'true';

  for (const input of root.querySelectorAll('[data-field-id]')) {
    const handler = () => {
      if (input.disabled) return;
      if (input.readOnly || input.getAttribute('aria-readonly') === 'true') {
        restoreLockedSkillValue(input);
        return;
      }
      const fieldId = input.dataset.fieldId;
      const value = input.type === 'checkbox' ? input.checked : input.value;
      onChange(fieldId, value);
    };
    input.addEventListener('input', handler);
    input.addEventListener('change', handler);
    guardReadonlySkillNumber(input);
  }
}
