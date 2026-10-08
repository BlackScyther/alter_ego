import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseFeatListing,
  parseFeatPrerequisites,
  parseFeatBonuses,
  parseFeatGrants
} from '../src/character/feat-parse.js';

test('parseFeatListing copies tier and prerequisite', () => {
  const entry = {
    id: 'feat1',
    listing_fields: { Name: 'Toughness', Tier: 'Heroic', Prerequisite: '11th level', SourceBook: 'PHB' },
    body_html: '<p>+5 HP per tier.</p>'
  };
  const row = parseFeatListing(entry);
  assert.equal(row.tier, 'Heroic');
  assert.match(row.prerequisiteRaw, /11th level/);
});

test('parseFeatPrerequisites extracts level and class atoms', () => {
  const atoms = parseFeatPrerequisites('11th level, Fighter');
  assert.ok(atoms.some((a) => a.kind === 'level' && a.minValue === 11));
  assert.ok(atoms.some((a) => a.kind === 'class' && a.target === 'fighter'));
});

test('parseFeatBonuses reads skill bonus from HTML', () => {
  const entry = {
    id: 'feat3',
    listing_fields: { Name: 'Novice Historian' },
    body_html: '<p><b>Skill Bonus:</b> +2 History (Skill type).</p>'
  };
  const { skill } = parseFeatBonuses(entry);
  assert.equal(skill.length, 1);
  assert.equal(skill[0].skill, 'history');
  assert.equal(skill[0].amount, 2);
});

test('parseFeatGrants detects ritual caster', () => {
  const grants = parseFeatGrants('<p>You can master and perform rituals (Ritual Caster).</p>');
  assert.ok(grants.some((g) => g.kind === 'ritual_caster'));
});
