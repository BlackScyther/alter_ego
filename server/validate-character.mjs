/** Mirror of src/character/io.js validateCharacterDocument for the API. */

export function validateCharacterDocument(data) {
  const errors = [];
  if (!data || typeof data !== 'object') {
    errors.push('File is not a valid JSON object.');
    return errors;
  }
  if (!data.identity || typeof data.identity !== 'object') {
    errors.push('Missing identity block.');
    return errors;
  }
  if (!String(data.identity.characterName || '').trim()) {
    errors.push('Missing character name.');
  }
  const level = Number(data.identity.level);
  if (!Number.isFinite(level) || level < 1 || level > 30) {
    errors.push('Level must be between 1 and 30.');
  }
  if (!data.id || typeof data.id !== 'string') {
    errors.push('Missing character id.');
  }
  return errors;
}

export function prepareCharacterForCampaign(data, campaignId) {
  const errors = validateCharacterDocument(data);
  if (errors.length) {
    const err = new Error(errors.join(' '));
    err.status = 400;
    throw err;
  }
  const now = new Date().toISOString();
  return {
    ...data,
    meta: {
      ...data.meta,
      campaignId,
      updatedAt: now,
      source: data.meta?.source ?? 'editor'
    }
  };
}
