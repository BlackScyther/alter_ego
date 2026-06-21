/** API-side validation for feedback submissions. */

export const FEEDBACK_CATEGORIES = Object.freeze([
  'bug',
  'stuck',
  'wrong',
  'missing',
  'feature',
  'different'
]);

export const FEEDBACK_AREAS = Object.freeze([
  'editor',
  'sheet',
  'gm',
  'encounters',
  'workshop',
  'campaigns',
  'resources',
  'other'
]);

export const FEEDBACK_SEVERITIES = Object.freeze(['low', 'medium', 'high']);

export const FEEDBACK_STATUSES = Object.freeze([
  'open',
  'triaged',
  'resolved',
  'wontfix'
]);

const LIMITS = Object.freeze({
  title: 200,
  message: 4000,
  contact: 200,
  role: 40,
  appVersion: 40,
  userAgent: 500
});

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Validate a raw feedback payload from the public form.
 * @returns {string[]} list of human-readable errors (empty when valid)
 */
export function validateFeedback(data) {
  const errors = [];
  if (!data || typeof data !== 'object') {
    errors.push('Feedback must be a JSON object.');
    return errors;
  }

  const title = asTrimmedString(data.title);
  if (!title) {
    errors.push('Title is required.');
  } else if (title.length > LIMITS.title) {
    errors.push(`Title must be at most ${LIMITS.title} characters.`);
  }

  const message = asTrimmedString(data.message);
  if (!message) {
    errors.push('Message is required.');
  } else if (message.length > LIMITS.message) {
    errors.push(`Message must be at most ${LIMITS.message} characters.`);
  }

  if (!FEEDBACK_CATEGORIES.includes(data.category)) {
    errors.push('Category is invalid.');
  }

  if (data.area != null && data.area !== '' && !FEEDBACK_AREAS.includes(data.area)) {
    errors.push('Area is invalid.');
  }

  if (
    data.severity != null &&
    data.severity !== '' &&
    !FEEDBACK_SEVERITIES.includes(data.severity)
  ) {
    errors.push('Severity is invalid.');
  }

  const contact = asTrimmedString(data.contact);
  if (contact.length > LIMITS.contact) {
    errors.push(`Contact must be at most ${LIMITS.contact} characters.`);
  }

  return errors;
}

/**
 * Normalize a validated payload into a row-ready feedback record.
 * Throws a 400 error when validation fails.
 * @param {object} data raw payload
 * @param {{ userAgent?: string }} [context]
 */
export function prepareFeedback(data, context = {}) {
  const errors = validateFeedback(data);
  if (errors.length) {
    const err = new Error(errors.join(' '));
    err.status = 400;
    throw err;
  }

  const clamp = (value, max) => {
    const str = asTrimmedString(value);
    return str ? str.slice(0, max) : null;
  };

  const role = ['player', 'gm'].includes(data.role) ? data.role : null;

  return {
    category: data.category,
    severity: FEEDBACK_SEVERITIES.includes(data.severity) ? data.severity : null,
    area: FEEDBACK_AREAS.includes(data.area) ? data.area : null,
    role,
    title: asTrimmedString(data.title).slice(0, LIMITS.title),
    message: asTrimmedString(data.message).slice(0, LIMITS.message),
    appVersion: clamp(data.appVersion, LIMITS.appVersion),
    userAgent: clamp(context.userAgent, LIMITS.userAgent),
    contact: clamp(data.contact, LIMITS.contact)
  };
}
