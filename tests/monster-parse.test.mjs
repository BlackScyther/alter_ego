import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMonsterStatLine,
  parseMonsterCombatStats,
  resolveMonsterSpawnStats,
  looksLikeMonsterStatLine
} from '../src/character/monster-parse.js';

const bugbear = {
  id: 'monster_bugbear',
  listing_fields: { Name: 'Bugbear Warrior', Level: '5' },
  body_html:
    '<p class=flavor>HP 75; Bloodied 37; AC 19, Fortitude 17, Reflex 16, Will 14</p>' +
    '<p>Speed 6; Initiative +5; Perception +4</p>'
};

test('looksLikeMonsterStatLine detects combat stat paragraphs', () => {
  assert.equal(looksLikeMonsterStatLine('HP 75; AC 19'), true);
  assert.equal(looksLikeMonsterStatLine('Bugbears are towering goblinoids.'), false);
});

test('parseMonsterStatLine extracts HP, defenses, initiative', () => {
  const stats = parseMonsterStatLine(bugbear.body_html);
  assert.ok(stats);
  assert.equal(stats.hp, 75);
  assert.equal(stats.bloodiedHp, 37);
  assert.equal(stats.ac, 19);
  assert.equal(stats.fort, 17);
  assert.equal(stats.ref, 16);
  assert.equal(stats.will, 14);
  assert.equal(stats.initiative, 5);
  assert.equal(stats.speedSquares, 6);
});

test('resolveMonsterSpawnStats prefers normalized combat stats', () => {
  const stats = resolveMonsterSpawnStats(bugbear, {
    hp: 75,
    ac: 19,
    fort: 17,
    ref: 16,
    will: 14,
    initiative: 5
  });
  assert.equal(stats.hp, 75);
  assert.equal(stats.ac, 19);
  assert.equal(stats.fort, 17);
});

test('parseMonsterCombatStats merges listing and body', () => {
  const goblin = {
    listing_fields: { Level: '1', HP: '29', AC: '16', Fort: '13', Ref: '14', Will: '11', Initiative: '7' },
    body_html: '<p>Quick skirmisher.</p>'
  };
  const stats = parseMonsterCombatStats(goblin);
  assert.equal(stats.hp, 29);
  assert.equal(stats.ac, 16);
  assert.equal(stats.initiative, 7);
});
