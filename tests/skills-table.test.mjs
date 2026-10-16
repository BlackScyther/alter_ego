import assert from 'node:assert/strict';
import test from 'node:test';
import { getSheetMirrorSections } from '../src/editor/sheet-mirror-fields.js';
import { getSkillFieldMap, renderSkillsTableHtml } from '../src/editor/skills-table.js';

function inputTags(html) {
  return [...html.matchAll(/<input\b[^>]*>/g)].map((match) => match[0]);
}

function fieldId(tag) {
  return tag.match(/data-field-id="([^"]+)"/)?.[1] ?? '';
}

function hasReadonly(tag) {
  return /(?:^|\s)readonly(?:[\s=/>]|$)/.test(tag);
}

test('skill number fields except Misc are read-only in the table markup', () => {
  const tags = inputTags(renderSkillsTableHtml());
  const numbers = tags.filter((tag) => /type="number"/.test(tag));
  assert.ok(numbers.length > 0);

  for (const tag of numbers) {
    const id = fieldId(tag);
    if (id.endsWith('-misc')) {
      assert.equal(hasReadonly(tag), false, `${id} stays editable`);
    } else {
      assert.equal(hasReadonly(tag), true, `${id} is read-only`);
    }
  }

  const trained = tags.find((tag) => fieldId(tag) === 'skill-acrobatics-trained');
  assert.ok(trained);
  assert.match(trained, /type="checkbox"/);
  assert.equal(hasReadonly(trained), false);
});

test('skill field maps lock every number except Misc', () => {
  const map = getSkillFieldMap();
  assert.equal(map.get('armor-penalty-global').readonly, true);
  assert.equal(map.get('skill-acrobatics-bonus').readonly, true);
  assert.equal(map.get('skill-acrobatics-mod-half').readonly, true);
  assert.equal(map.get('skill-acrobatics-pen').readonly, true);
  assert.equal(map.get('skill-athletics-pen'), undefined);
  assert.equal(map.get('skill-acrobatics-misc').readonly, undefined);
  assert.equal(map.get('skill-acrobatics-trained').readonly, undefined);

  const skills = getSheetMirrorSections().find((section) => section.layout === 'skills-table');
  const fields = new Map(skills.fields.map((field) => [field.id, field]));
  assert.equal(fields.get('armor-penalty-global').readonly, true);
  assert.equal(fields.get('skill-endurance-pen').readonly, true);
  assert.equal(fields.get('skill-endurance-misc').readonly, false);
  assert.equal(fields.get('skill-endurance-misc').wizardReadonly, true);
});
