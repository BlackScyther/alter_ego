import { escapeHtml as esc } from '../../shared/escape-html.js';
import { formatPowerListingMeta } from '../power-filter.js';
import { pickerCardClass, setPickerCardSelected, clearPickerCardSelection } from '../picker/picker-card.js';
import { linkCompendiumTermsInText } from '../../ui/compendium-links.js';
import { parsePowerAbilityOptions, parsePowerDamageOptions } from '../../character/power-ability-parse.js';
import { setRacePowerAbilityChoice, setRacePowerDamageChoice } from '../../character/race-selections.js';

const ABILITY_LABEL = {
  str: 'Strength',
  con: 'Constitution',
  dex: 'Dexterity',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma'
};

/**
 * Render the per-power ability-score dropdown. The options come from the power
 * entry; the pick is a per-character selection. After a pick, the select shows
 * only the chosen ability.
 * @param {HTMLElement} cardsEl
 * @param {object} opts
 */
function renderPowerAbilityChoice(cardsEl, { powerId, options, picked, onChange }) {
  const wrap = document.createElement('div');
  wrap.className = 'race-power-ability';
  wrap.dataset.powerId = powerId;
  const selectId = `race-grant-power-ability-${powerId}`;

  const label = document.createElement('label');
  label.className = 'race-power-ability-label';
  label.setAttribute('for', selectId);
  label.textContent = 'Power ability';
  wrap.appendChild(label);

  const select = document.createElement('select');
  select.className = 'race-choice-combo race-power-ability-combo';
  select.id = selectId;
  select.setAttribute('aria-label', 'Choose the ability score for this power');

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Choose ability…';
  select.appendChild(placeholder);

  for (const opt of options.options) {
    const option = document.createElement('option');
    option.value = opt.ability;
    option.textContent = ABILITY_LABEL[opt.ability] ?? String(opt.ability).toUpperCase();
    if (picked === opt.ability) option.selected = true;
    select.appendChild(option);
  }

  select.addEventListener('change', () => onChange?.(powerId, select.value));
  wrap.appendChild(select);
  cardsEl.appendChild(wrap);
}

/**
 * Render the per-power damage-type dropdown (e.g. Dragon Breath). Options come
 * from the power entry; the pick is a per-character selection.
 * @param {HTMLElement} cardsEl
 * @param {object} opts
 */
function renderPowerDamageChoice(cardsEl, { powerId, options, picked, onChange }) {
  const wrap = document.createElement('div');
  wrap.className = 'race-power-damage';
  wrap.dataset.powerId = powerId;
  const selectId = `race-grant-power-damage-${powerId}`;

  const label = document.createElement('label');
  label.className = 'race-power-damage-label';
  label.setAttribute('for', selectId);
  label.textContent = 'Power damage type';
  wrap.appendChild(label);

  const select = document.createElement('select');
  select.className = 'race-choice-combo race-power-damage-combo';
  select.id = selectId;
  select.setAttribute('aria-label', 'Choose the damage type for this power');

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Choose damage type…';
  select.appendChild(placeholder);

  for (const opt of options.options) {
    const option = document.createElement('option');
    option.value = opt.damageType;
    option.textContent = opt.damageType
      ? opt.damageType.charAt(0).toUpperCase() + opt.damageType.slice(1)
      : '';
    if (picked === opt.damageType) option.selected = true;
    select.appendChild(option);
  }

  select.addEventListener('change', () => onChange?.(powerId, select.value));
  wrap.appendChild(select);
  cardsEl.appendChild(wrap);
}

/**
 * @param {HTMLElement} parent
 * @param {string} title
 */
function renderGroup(parent, title) {
  const group = document.createElement('div');
  group.className = 'race-grants-group power-collection-group';
  group.innerHTML = `<h4 class="power-collection-group-title">${esc(title)}</h4><div class="race-grants-cards power-collection-cards flex flex-col gap-2 w-full"></div>`;
  parent.appendChild(group);
  return group.querySelector('.race-grants-cards');
}

/**
 * @param {HTMLElement} cardsEl
 * @param {object} opts
 */
function renderGrantCard(cardsEl, { id, name, meta, linkIndex, onPreview }) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `${pickerCardClass(false)} power-collection-card race-grant-card`;
  btn.dataset.id = id;
  btn.dataset.readonly = 'true';
  const linkedName = linkIndex ? linkCompendiumTermsInText(name, linkIndex) : esc(name);
  btn.innerHTML = `
    <span class="block">${linkedName}</span>
    <span class="block text-sm font-normal text-slate-400">${esc(meta)}</span>`;
  btn.addEventListener('click', () => {
    onPreview?.(id);
    clearPickerCardSelection(cardsEl.closest('.race-grants-panel') ?? cardsEl);
    setPickerCardSelected(btn, true);
  });
  cardsEl.appendChild(btn);
}

/**
 * @param {HTMLElement} root
 * @param {object} ctx
 */
export async function renderRaceGrantsPanel(root, ctx) {
  const {
    character,
    compendium,
    linkIndex,
    onPreview,
    onPowerAbilityChange,
    onPowerDamageChange,
    onPersist
  } = ctx;
  root.innerHTML = '';
  root.classList.add('race-grants-panel');

  const powerIds = character.selections?.racePowerIds ?? [];
  const featIds = character.selections?.raceFeatIds ?? [];
  const abilityChoices = character.selections?.racePowerAbilityChoices ?? {};
  const damageChoices = character.selections?.racePowerDamageChoices ?? {};

  const handleAbilityChange =
    onPowerAbilityChange ??
    (async (powerId, ability) => {
      setRacePowerAbilityChoice(character, powerId, ability);
      await onPersist?.();
    });

  const handleDamageChange =
    onPowerDamageChange ??
    (async (powerId, damageType) => {
      setRacePowerDamageChoice(character, powerId, damageType);
      await onPersist?.();
    });

  if (powerIds.length) {
    const cardsEl = renderGroup(root, 'Racial powers');
    for (const pid of powerIds) {
      const entry = await compendium.getEntry(pid);
      if (!entry) continue;
      renderGrantCard(cardsEl, {
        id: pid,
        name: entry.listing_fields?.Name ?? pid,
        meta: formatPowerListingMeta(entry.listing_fields),
        linkIndex,
        onPreview: async (id) => onPreview?.(await compendium.getEntry(id))
      });

      const key = String(pid).toLowerCase();
      const options =
        (compendium.getPowerAbilityOptions ? await compendium.getPowerAbilityOptions(pid) : null) ??
        parsePowerAbilityOptions(entry);
      if (options?.options?.length) {
        renderPowerAbilityChoice(cardsEl, {
          powerId: key,
          options,
          picked: abilityChoices[key] ?? '',
          onChange: handleAbilityChange
        });
      }

      const damageOptions =
        (compendium.getPowerDamageOptions ? await compendium.getPowerDamageOptions(pid) : null) ??
        parsePowerDamageOptions(entry);
      if (damageOptions?.options?.length) {
        renderPowerDamageChoice(cardsEl, {
          powerId: key,
          options: damageOptions,
          picked: damageChoices[key] ?? '',
          onChange: handleDamageChange
        });
      }
    }
  }

  if (featIds.length) {
    const cardsEl = renderGroup(root, 'Racial feats');
    for (const fid of featIds) {
      const entry = await compendium.getEntry(fid);
      if (!entry) continue;
      const meta = [entry.listing_fields?.Tier, entry.listing_fields?.SourceBook].filter(Boolean).join(' · ');
      renderGrantCard(cardsEl, {
        id: fid,
        name: entry.listing_fields?.Name ?? fid,
        meta: meta || 'Feat',
        linkIndex,
        onPreview: async (id) => onPreview?.(await compendium.getEntry(id))
      });
    }
  }
}
