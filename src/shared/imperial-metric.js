/**
 * Parse imperial height/weight strings from the iws compendium and append metric helpers.
 */

function parseFeetInches(token) {
  const s = String(token ?? '').trim();
  const m = s.match(/(\d+)\s*['′]\s*(\d+)\s*["″]?/);
  if (!m) return null;
  return Number(m[1]) * 12 + Number(m[2]);
}

function parseHeightRange(text) {
  const s = String(text ?? '');
  const parts = s.split(/[–—-]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) {
    const single = parseFeetInches(s);
    return single == null ? null : { minIn: single, maxIn: single };
  }
  const minIn = parseFeetInches(parts[0]);
  const maxIn = parseFeetInches(parts[1]);
  if (minIn == null || maxIn == null) return null;
  return { minIn, maxIn };
}

function parseWeightRange(text) {
  const s = String(text ?? '').replace(/\blbs?\b/gi, '').trim();
  const parts = s.split(/[–—-]/).map((p) => parseInt(p.replace(/[^\d]/g, ''), 10)).filter((n) => !Number.isNaN(n));
  if (!parts.length) return null;
  if (parts.length === 1) return { minLb: parts[0], maxLb: parts[0] };
  return { minLb: parts[0], maxLb: parts[1] };
}

function inchesToCm(inches) {
  return Math.round(inches * 2.54);
}

function lbToKg(lb) {
  return Math.round(lb * 0.453592);
}

/** 4e grid: 1 square = 5 feet. */
const FEET_PER_SQUARE = 5;

function feetToMeters(ft) {
  return Math.round(ft * 0.3048 * 10) / 10;
}

function squaresToMeters(squares) {
  return feetToMeters(squares * FEET_PER_SQUARE);
}

function hasMetricSuffix(text) {
  return /\s·\s*\d/.test(String(text ?? ''));
}

function formatCmRange(minIn, maxIn) {
  const minCm = inchesToCm(minIn);
  const maxCm = inchesToCm(maxIn);
  return minCm === maxCm ? `${minCm} cm` : `${minCm}–${maxCm} cm`;
}

function formatKgRange(minLb, maxLb) {
  const minKg = lbToKg(minLb);
  const maxKg = lbToKg(maxLb);
  return minKg === maxKg ? `${minKg} kg` : `${minKg}–${maxKg} kg`;
}

/**
 * @param {string} imperialText
 * @returns {string}
 */
export function appendMetricHeight(imperialText) {
  const range = parseHeightRange(imperialText);
  if (!range) return imperialText;
  return `${imperialText.trim()} · ${formatCmRange(range.minIn, range.maxIn)}`;
}

/**
 * @param {string} imperialText
 * @returns {string}
 */
export function appendMetricWeight(imperialText) {
  const range = parseWeightRange(imperialText);
  if (!range) return imperialText;
  return `${imperialText.trim()} · ${formatKgRange(range.minLb, range.maxLb)}`;
}

/**
 * @param {string} text e.g. "5 squares"
 * @returns {string}
 */
export function appendMetricSpeed(text) {
  const s = String(text ?? '').trim();
  if (!s || hasMetricSuffix(s)) return s;
  const match = s.match(/(\d+)\s*squares?\b/i);
  if (!match) return s;
  return `${s} · ${squaresToMeters(Number(match[1]))} m`;
}

/**
 * Append meters for vision ranges in feet or squares (e.g. darkvision 60 ft.).
 * @param {string} text
 * @returns {string}
 */
export function appendMetricVision(text) {
  const s = String(text ?? '').trim();
  if (!s || hasMetricSuffix(s)) return s;

  const ftMatch = s.match(/(\d+)\s*(?:ft\.?|feet)\b/i) ?? s.match(/(\d+)\s*'\b/);
  if (ftMatch) {
    return `${s} · ${feetToMeters(Number(ftMatch[1]))} m`;
  }

  const sqMatch = s.match(/(\d+)\s*squares?\b/i);
  if (sqMatch) {
    return `${s} · ${squaresToMeters(Number(sqMatch[1]))} m`;
  }

  return s;
}

/**
 * @param {string} label
 * @param {string} value
 * @returns {string}
 */
export function formatMechanicalValue(label, value) {
  const key = String(label ?? '').toLowerCase();
  if (key.includes('average height')) return appendMetricHeight(value);
  if (key.includes('average weight')) return appendMetricWeight(value);
  if (key === 'speed' || key.includes('speed')) return appendMetricSpeed(value);
  if (key === 'vision' || key.includes('vision')) return appendMetricVision(value);
  return value;
}
