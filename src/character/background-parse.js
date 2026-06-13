/**
 * Background compendium parsing and structured preview rendering.
 */

import { SKILLS } from '../formulas.js';
import { escapeHtml as esc } from '../shared/escape-html.js';
import { parseBackgroundPrerequisite } from '../editor/background-prerequisite.js';
import {
  detectBackgroundEffects,
  filterBenefitRowsForEffects,
  formatBackgroundEffectNotes,
  renderBackgroundEffectSections
} from './background-effects.js';

const LABELED_P_RE = /<p([^>]*)>([\s\S]*?)<\/p>/gi;
const META_FIELD_RE = /<b>\s*([^:<]+):\s*<\/b>\s*([^<]*)/gi;
const ASSOCIATED_SKILLS_BOLD_RE = /<b>\s*Associated Skills:?\s*<\/b>\s*([^<]+)/i;
const ASSOCIATED_SKILLS_ITALIC_RE = /<i>\s*Associated Skills:?\s*<\/i>\s*([^<]+)/i;
const INLINE_BENEFIT_RE = /<i>\s*Benefit:?\s*<\/i>\s*([^<]+)/i;
const CHOICE_SKILL_BONUS_RE =
  /choose\s+one\s+associated\s+skill[\s\S]*?\+2[\s\S]*?(?:two\s+associated\s+skills|choose\s+two)[\s\S]*?\+1/i;
const FIXED_SKILL_RE = /\+\s*(\d+)\s*([A-Za-z]+)/g;
const FIXED_BONUS_TO_SKILLS_RE = /\+\s*(\d+)\s*bonus\s+to\s+([^.]+?)(?:\s+checks)?(?:\.|$)/i;
const PUBLISHED_IN_RE = /<p[^>]*class\s*=\s*["']?publishedIn["']?[^>]*>[\s\S]*?<\/p>/gi;
const FLAVORTEXT_P_RE = /<p[^>]*class\s*=\s*["']?flavortext["']?[^>]*>[\s\S]*?<\/p>/gi;
const PLAYER_H1_RE = /<h1[^>]*>[\s\S]*?<\/h1>/gi;
const INLINE_ASSOCIATED_SKILLS_RE = /<i>\s*Associated Skills:?\s*<\/i>[^<]+(?:<br\s*\/?>)?/gi;
const INLINE_BENEFIT_LINE_RE = /<i>\s*Benefit:?\s*<\/i>[^<]+(?:<br\s*\/?>)?/gi;

/** @typedef {'choice' | 'fixed' | 'none'} BackgroundSkillBonusKind */

/**
 * @param {string} key
 */
export function normalizeBackgroundSkillId(key) {
  const k = String(key ?? '').trim().toLowerCase();
  const ids = SKILLS.map((s) => s.id);
  if (ids.includes(k)) return k;
  const byName = SKILLS.find((s) => s.name.toLowerCase() === k);
  return byName?.id ?? k;
}

/**
 * @param {string} skillId
 */
export function formatSkillLabel(skillId) {
  const skill = SKILLS.find((s) => s.id === skillId);
  return skill?.name ?? skillId;
}

function stripHtml(html) {
  if (typeof document !== 'undefined') {
    const d = document.createElement('div');
    d.innerHTML = html ?? '';
    return d.textContent.replace(/\s+/g, ' ').trim();
  }
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateFlavor(text, max = 80) {
  const t = String(text ?? '').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).trim()}…`;
}

/**
 * @param {string} html
 */
function parseMetaFromFlavortext(html) {
  /** @type {Record<string, string>} */
  const meta = {};
  const flavMatch = html.match(/<p[^>]*class\s*=\s*["']?flavortext["']?[^>]*>([\s\S]*?)<\/p>/i);
  const block = flavMatch?.[1] ?? '';
  let m;
  const re = new RegExp(META_FIELD_RE.source, 'gi');
  while ((m = re.exec(block)) !== null) {
    const label = m[1].replace(/\s+/g, ' ').trim();
    const value = m[2].replace(/\s+/g, ' ').trim();
    if (label && value) meta[label] = value;
  }
  return meta;
}

/**
 * @param {string} html
 */
function extractParagraphs(html) {
  /** @type {Array<{ attrs: string, inner: string, text: string }>} */
  const paragraphs = [];
  let m;
  const re = new RegExp(LABELED_P_RE.source, 'gi');
  while ((m = re.exec(html)) !== null) {
    if (/class\s*=\s*["']?flavortext["']?/i.test(m[1])) continue;
    if (/class\s*=\s*["']?publishedIn["']?/i.test(m[1])) continue;
    paragraphs.push({
      attrs: m[1] ?? '',
      inner: m[2] ?? '',
      text: stripHtml(m[2])
    });
  }
  return paragraphs;
}

/**
 * @param {string} html
 */
function extractAssociatedSkills(html) {
  const bold = html.match(ASSOCIATED_SKILLS_BOLD_RE);
  if (bold) return parseAssociatedSkills(bold[1]);
  const italic = html.match(ASSOCIATED_SKILLS_ITALIC_RE);
  if (italic) return parseAssociatedSkills(italic[1]);
  return [];
}

/**
 * @param {string} benefitText
 */
function parseFixedSkillBonusesFromBenefit(benefitText) {
  const text = stripHtml(benefitText);
  if (!text) return [];
  if (/\bwhen\b/i.test(text)) return [];

  const match = text.match(FIXED_BONUS_TO_SKILLS_RE);
  if (!match) return [];

  const amount = Number(match[1]) || 0;
  if (!amount) return [];

  return String(match[2] ?? '')
    .split(/\s+and\s+|,/i)
    .map((part) => normalizeBackgroundSkillId(part.trim()))
    .filter((id) => SKILLS.some((s) => s.id === id))
    .map((skill) => ({ skill, amount }));
}

/**
 * @param {string} html
 */
function extractInlineBenefit(html) {
  const match = html.match(INLINE_BENEFIT_RE);
  if (!match) return null;
  const valueHtml = match[1].trim();
  return {
    label: 'Benefit',
    valueHtml,
    valueText: stripHtml(valueHtml)
  };
}

/**
 * @param {string} html
 */
function extractNarrativeHtml(html) {
  let working = String(html ?? '');
  working = working.replace(PLAYER_H1_RE, '');
  working = working.replace(PUBLISHED_IN_RE, '');
  working = working.replace(FLAVORTEXT_P_RE, '');
  working = working.replace(INLINE_ASSOCIATED_SKILLS_RE, '');
  working = working.replace(INLINE_BENEFIT_LINE_RE, '');

  /** @type {string[]} */
  const chunks = [];
  for (const para of extractParagraphs(working)) {
    if (!para.text || isLabeledMechanicalParagraph(para.inner)) continue;
    chunks.push(`<p class="background-flavor-lead">${para.inner}</p>`);
  }

  const raw = working.replace(/<p[^>]*>[\s\S]*?<\/p>/gi, '').trim();
  const rawText = stripHtml(raw);
  if (rawText) {
    chunks.push(`<div class="background-flavor-body-raw">${raw}</div>`);
  }

  return chunks.join('');
}

/**
 * @param {string} inner
 */
function isLabeledMechanicalParagraph(inner) {
  return /<b\s*[^>]*>[^<]+:\s*<\/b>/i.test(inner);
}

/**
 * @param {string} label
 */
function isReservedBenefitLabel(label) {
  const norm = label.toLowerCase().replace(/\s+/g, ' ').trim();
  return norm === 'associated skills' || norm === 'skill bonus' || norm === 'skill bonuses';
}

/**
 * @param {string} inner
 */
function parseLabeledParagraph(inner) {
  const m = inner.match(/<b\s*[^>]*>\s*([^:<]+):\s*<\/b>\s*([\s\S]*)/i);
  if (!m) return null;
  const label = m[1].replace(/\s+/g, ' ').trim();
  const valueHtml = m[2].trim();
  if (!label || isReservedBenefitLabel(label)) return null;
  return { label, valueHtml, valueText: stripHtml(valueHtml) };
}

/**
 * @param {string} text
 */
function parseAssociatedSkills(text) {
  return String(text ?? '')
    .split(/,|\band\b/i)
    .map((s) => normalizeBackgroundSkillId(s.trim()))
    .filter((id) => SKILLS.some((s) => s.id === id));
}

/**
 * @param {string} html
 * @param {string[]} [structuredSkills]
 */
function parseFixedSkillBonuses(html, structuredSkills = []) {
  if (structuredSkills.length) {
    return structuredSkills.map((b) => ({
      skill: normalizeBackgroundSkillId(b.skill),
      amount: Number(b.amount) || 0
    }));
  }
  const text = stripHtml(html);
  const block = text.match(/skill\s+bonus[s]?:?\s*([^.]+)/i)?.[1] ?? '';
  if (!block || /choose\s+(one|two)/i.test(block)) return [];
  /** @type {Array<{ skill: string, amount: number }>} */
  const out = [];
  let m;
  const re = new RegExp(FIXED_SKILL_RE.source, 'g');
  while ((m = re.exec(block)) !== null) {
    const skill = normalizeBackgroundSkillId(m[2]);
    if (!SKILLS.some((s) => s.id === skill)) continue;
    out.push({ skill, amount: Number(m[1]) || 0 });
  }
  return out;
}

/**
 * @param {string} html
 * @param {Array<{ skill: string, amount: number }>} fixedBonuses
 * @param {string[]} associatedSkills
 */
function detectSkillBonusKind(html, fixedBonuses, associatedSkills) {
  const text = stripHtml(html);
  if (associatedSkills.length) return 'choice';
  if (CHOICE_SKILL_BONUS_RE.test(text)) return 'choice';
  if (fixedBonuses.length) return 'fixed';
  if (/skill\s+bonus/i.test(text) && /choose/i.test(text)) return 'choice';
  return 'none';
}

/**
 * @param {object | null | undefined} entry
 */
export function parseBackgroundEntry(entry) {
  if (!entry) {
    return {
      title: '',
      meta: {},
      descriptionHtml: '',
      descriptionSummary: '',
      associatedSkills: [],
      skillBonusKind: 'none',
      fixedSkillBonuses: [],
      benefitRows: [],
      effects: []
    };
  }

  const html = entry.body_html ?? '';
  const listing = entry.listing_fields ?? {};
  const flavMeta = parseMetaFromFlavortext(html);
  const prereq = parseBackgroundPrerequisite(entry);

  /** @type {Record<string, string>} */
  const meta = {};
  if (flavMeta.Type || listing.Type) meta.type = flavMeta.Type || listing.Type;
  if (flavMeta['Campaign Setting'] || listing.Campaign) {
    meta.campaign = flavMeta['Campaign Setting'] || listing.Campaign;
  }
  if (prereq || flavMeta.Prerequisite) meta.prerequisite = prereq || flavMeta.Prerequisite;

  /** @type {Array<{ label: string, valueHtml: string, valueText: string }>} */
  const benefitRows = [];
  const associatedSkills = extractAssociatedSkills(html);

  for (const para of extractParagraphs(html)) {
    if (isLabeledMechanicalParagraph(para.inner)) {
      const labeled = parseLabeledParagraph(para.inner);
      if (labeled) benefitRows.push(labeled);
    }
  }

  const inlineBenefit = extractInlineBenefit(html);
  if (inlineBenefit) benefitRows.push(inlineBenefit);

  const narrativeHtml = extractNarrativeHtml(html);
  const descriptionHtml = narrativeHtml
    ? `<div class="background-flavor-content">${narrativeHtml}</div>`
    : '';
  const descriptionSummary = narrativeHtml ? truncateFlavor(stripHtml(narrativeHtml)) : '';

  const structuredSkills = Array.isArray(entry.skill_bonuses) ? entry.skill_bonuses : [];
  let fixedSkillBonuses = parseFixedSkillBonuses(html, structuredSkills);
  if (!fixedSkillBonuses.length && inlineBenefit && !associatedSkills.length) {
    fixedSkillBonuses = parseFixedSkillBonusesFromBenefit(inlineBenefit.valueText);
  }
  const skillBonusKind = detectSkillBonusKind(html, fixedSkillBonuses, associatedSkills);

  const draft = {
    title: listing.Name ?? entry.id ?? '',
    meta,
    descriptionHtml,
    descriptionSummary,
    associatedSkills,
    skillBonusKind,
    fixedSkillBonuses,
    benefitRows
  };
  const effects = detectBackgroundEffects(entry, draft);
  const filteredBenefitRows = filterBenefitRowsForEffects(benefitRows, effects);

  return {
    ...draft,
    benefitRows: filteredBenefitRows,
    effects
  };
}

/**
 * @param {{ mode?: string | null, skills?: string[] }} choices
 * @param {ReturnType<typeof parseBackgroundEntry>} parsed
 */
export function formatBackgroundSkillChoiceStatus(choices, parsed) {
  const mode = choices?.mode ?? null;
  const skills = choices?.skills ?? [];
  if (!mode || !skills.length) {
    return 'Choose a skill bonus option below.';
  }
  if (mode === 'plus2-one' && skills.length === 1) {
    return `Selected: ${formatSkillLabel(skills[0])} (+2)`;
  }
  if (mode === 'plus1-two' && skills.length === 2) {
    return `Selected: ${formatSkillLabel(skills[0])} (+1), ${formatSkillLabel(skills[1])} (+1)`;
  }
  const need = mode === 'plus2-one' ? 1 : 2;
  return `Select ${need} skill${need > 1 ? 's' : ''} (${skills.length}/${need} chosen).`;
}

/**
 * @param {ReturnType<typeof parseBackgroundEntry>} parsed
 * @param {{ mode?: string | null, skills?: string[] }} [choices]
 */
function renderSkillSection(parsed, choices = {}) {
  const mode = choices.mode ?? 'plus2-one';
  const picked = new Set(choices.skills ?? []);

  if (parsed.skillBonusKind === 'fixed') {
    if (!parsed.fixedSkillBonuses.length) return '';
    const items = parsed.fixedSkillBonuses
      .map((b) => `<li><strong>Skill Bonus:</strong> +${b.amount} ${esc(formatSkillLabel(b.skill))}</li>`)
      .join('');
    return `<section class="background-skill-section"><h3 class="background-section-title">Skill Bonus</h3><ul class="background-benefits-list">${items}</ul></section>`;
  }

  if (parsed.skillBonusKind !== 'choice' || !parsed.associatedSkills.length) return '';

  const skillButtons = parsed.associatedSkills
    .map((skillId) => {
      const selected = picked.has(skillId);
      return `<button type="button" class="race-choice-btn background-skill-btn${selected ? ' race-choice-btn--selected' : ''}" data-skill="${esc(skillId)}" aria-pressed="${selected ? 'true' : 'false'}">${esc(formatSkillLabel(skillId))}</button>`;
    })
    .join('');

  return `<section class="background-skill-section">
    <h3 class="background-section-title">Associated Skills</h3>
    <p class="background-associated-list">${parsed.associatedSkills.map((id) => esc(formatSkillLabel(id))).join(', ')}</p>
    <fieldset class="background-skill-mode">
      <legend>Skill bonus</legend>
      <label class="background-mode-option">
        <input type="radio" name="background-skill-mode" value="plus2-one"${mode === 'plus2-one' ? ' checked' : ''} />
        <span>+2 to one skill</span>
      </label>
      <label class="background-mode-option">
        <input type="radio" name="background-skill-mode" value="plus1-two"${mode === 'plus1-two' ? ' checked' : ''} />
        <span>+1 to two skills</span>
      </label>
    </fieldset>
    <div class="race-inline-choices background-skill-choices" data-kind="skill">${skillButtons}</div>
    <p class="background-skill-status">${esc(formatBackgroundSkillChoiceStatus(choices, parsed))}</p>
  </section>`;
}

/**
 * @param {object | null | undefined} entry
 * @param {{ choices?: { mode?: string | null, skills?: string[] }, effectChoices?: { hpSubstituteAbility?: string | null } }} [opts]
 */
export function renderBackgroundPreviewHtml(entry, opts = {}) {
  const parsed = parseBackgroundEntry(entry);
  if (!parsed.title && !entry) return '';

  const metaItems = [];
  if (parsed.meta.type) metaItems.push(`<li><strong>Type:</strong> ${esc(parsed.meta.type)}</li>`);
  if (parsed.meta.campaign) metaItems.push(`<li><strong>Campaign Setting:</strong> ${esc(parsed.meta.campaign)}</li>`);
  if (parsed.meta.prerequisite) metaItems.push(`<li><strong>Prerequisite:</strong> ${esc(parsed.meta.prerequisite)}</li>`);

  const metaBlock = metaItems.length
    ? `<section class="background-details"><h3 class="background-section-title">Details</h3><ul class="background-meta-list">${metaItems.join('')}</ul></section>`
    : '';

  const benefitItems = parsed.benefitRows
    .map((row) => `<li><strong>${esc(row.label)}:</strong> ${row.valueHtml}</li>`)
    .join('');
  const benefitsBlock = benefitItems
    ? `<section class="background-benefits"><h3 class="background-section-title">Benefits</h3><ul class="background-benefits-list">${benefitItems}</ul></section>`
    : '';

  const skillBlock = renderSkillSection(parsed, opts.choices ?? {});
  const effectBlock = renderBackgroundEffectSections(parsed.effects ?? [], opts.effectChoices ?? {});

  const flavorBlock = parsed.descriptionHtml
    ? `<details class="background-flavor-fold"><summary>${esc(parsed.descriptionSummary || 'Description')}</summary><div class="background-flavor-body">${parsed.descriptionHtml}</div></details>`
    : '';

  return `<div class="background-preview"><h2 class="background-preview-title">${esc(parsed.title)}</h2>${metaBlock}${skillBlock}${effectBlock}${benefitsBlock}${flavorBlock}</div>`;
}

/**
 * @param {object | null | undefined} entry
 * @param {{ mode?: string | null, skills?: string[] }} [choices]
 * @param {{ hpSubstituteAbility?: string | null }} [effectChoices]
 */
export function buildBackgroundNotesText(entry, choices = {}, effectChoices = {}) {
  const parsed = parseBackgroundEntry(entry);
  const lines = [];

  if (parsed.meta.type) lines.push(`Type: ${parsed.meta.type}`);
  if (parsed.meta.campaign) lines.push(`Campaign Setting: ${parsed.meta.campaign}`);
  if (parsed.meta.prerequisite) lines.push(`Prerequisite: ${parsed.meta.prerequisite}`);

  if (parsed.skillBonusKind === 'fixed') {
    for (const b of parsed.fixedSkillBonuses) {
      lines.push(`Skill Bonus: +${b.amount} ${formatSkillLabel(b.skill)}`);
    }
  } else if (parsed.skillBonusKind === 'choice') {
    const mode = choices.mode;
    const skills = choices.skills ?? [];
    if (mode === 'plus2-one' && skills.length === 1) {
      lines.push(`Skill Bonus: +2 ${formatSkillLabel(skills[0])}`);
    } else if (mode === 'plus1-two' && skills.length === 2) {
      lines.push(`Skill Bonus: +1 ${formatSkillLabel(skills[0])}, +1 ${formatSkillLabel(skills[1])}`);
    } else if (parsed.associatedSkills.length) {
      lines.push(`Associated Skills: ${parsed.associatedSkills.map(formatSkillLabel).join(', ')}`);
    }
  }

  for (const line of formatBackgroundEffectNotes(parsed.effects ?? [], effectChoices)) {
    lines.push(line);
  }

  for (const row of parsed.benefitRows) {
    lines.push(`${row.label}: ${row.valueText}`);
  }

  return lines.join('\n');
}
